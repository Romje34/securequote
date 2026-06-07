-- ============================================================
-- SecureQuote Premium — Achats groupés
-- ============================================================

-- Table catalogue produits premium (géré par superadmin)
create table if not exists public.premium_products (
  id                  uuid primary key default gen_random_uuid(),
  reference           text,
  designation         text not null,
  brand               text,
  category            text not null,
  image_url           text,
  description         text,
  specs               jsonb,

  unit_price_regular  numeric(10,2) not null,
  unit_price_group    numeric(10,2) not null,
  target_quantity     int  not null default 10,
  current_quantity    int  not null default 0,

  -- open | triggered | closed
  status              text not null default 'open',
  deadline            timestamptz,
  triggered_at        timestamptz,
  sort_order          int  not null default 0,
  featured            boolean not null default false,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Table engagements owners (1 ligne max par owner par produit)
create table if not exists public.premium_orders (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.premium_products(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  quantity    int  not null default 1 check (quantity > 0),
  unit_price  numeric(10,2) not null,
  -- pending | confirmed | cancelled
  status      text not null default 'pending',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(product_id, owner_id)
);

-- RLS premium_products : lecture par tout utilisateur authentifié
alter table public.premium_products enable row level security;
drop policy if exists "premium_products_read" on public.premium_products;
create policy "premium_products_read"
  on public.premium_products for select
  using (auth.role() = 'authenticated');

-- RLS premium_orders : chaque owner gère ses propres commandes
alter table public.premium_orders enable row level security;
drop policy if exists "premium_orders_self" on public.premium_orders;
create policy "premium_orders_self"
  on public.premium_orders for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Trigger : mise à jour automatique de current_quantity + déclenchement
create or replace function public.sync_premium_quantity()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.premium_products
    set current_quantity = current_quantity + new.quantity,
        updated_at = now()
    where id = new.product_id;

  elsif TG_OP = 'UPDATE' then
    update public.premium_products
    set current_quantity = greatest(0, current_quantity + (new.quantity - old.quantity)),
        updated_at = now()
    where id = new.product_id;

  elsif TG_OP = 'DELETE' then
    update public.premium_products
    set current_quantity = greatest(0, current_quantity - old.quantity),
        updated_at = now()
    where id = old.product_id;
  end if;

  -- Déclencher automatiquement si objectif atteint
  update public.premium_products
  set status = 'triggered',
      triggered_at = now()
  where id = coalesce(new.product_id, old.product_id)
    and status = 'open'
    and current_quantity >= target_quantity;

  return coalesce(new, old);
end;
$$;

drop trigger if exists premium_orders_sync on public.premium_orders;
create trigger premium_orders_sync
  after insert or update or delete on public.premium_orders
  for each row execute procedure public.sync_premium_quantity();

-- updated_at trigger
drop trigger if exists premium_products_updated_at on public.premium_products;
create trigger premium_products_updated_at
  before update on public.premium_products
  for each row execute procedure public.set_updated_at();

drop trigger if exists premium_orders_updated_at on public.premium_orders;
create trigger premium_orders_updated_at
  before update on public.premium_orders
  for each row execute procedure public.set_updated_at();


-- ============================================================
-- CATALOGUE INITIAL — 12 produits, 4 catégories
-- ============================================================

insert into public.premium_products
  (reference, designation, brand, category, description,
   unit_price_regular, unit_price_group,
   target_quantity, current_quantity,
   status, deadline, sort_order, featured)
values

-- ── Vidéosurveillance ───────────────────────────────────────

('DS-2CD2387G2-LU',
 'Caméra dôme IP 8MP ColorVu AcuSense 4K',
 'Hikvision', 'Vidéosurveillance',
 'Technologie ColorVu : images couleur nuit et jour sans infrarouge. Résolution 4K, H.265+, AcuSense (détection humain/véhicule), IP67 IK10, IR 30 m, WDR 120 dB, audio intégré.',
 320.00, 210.00, 20, 14,
 'open', now() + interval '18 days', 10, true),

('IPC3618SB-ADF40KM-I0',
 'Caméra dôme IP 8MP Varifocale WDR 140 dB',
 'Uniview', 'Vidéosurveillance',
 'Objectif motorisé 2.7-13.5 mm, WDR 140 dB, Deep Learning analytique, détection personne/véhicule, IP67, H.265 Ultra, IR 80 m.',
 450.00, 292.00, 15, 9,
 'open', now() + interval '25 days', 20, false),

('IPC-HDW3849H-AS-PV',
 'Caméra dôme encastrée Full-Color 8MP',
 'Dahua', 'Vidéosurveillance',
 'Double éclairage LED (blanc + infrarouge), couleur totale en basse lumière, IA embarquée, micro intégré, IR 30 m, IP67, H.265+.',
 280.00, 184.00, 30, 27,
 'open', now() + interval '5 days', 30, true),

('QNV-8080R-AI',
 'Caméra dôme réseau 5MP IR 30 m AI',
 'Hanwha Vision', 'Vidéosurveillance',
 'Résolution 5 MP (2560×1920), IR LED 30 m, H.265, objectif 2.8 mm fixe, analyse IA intégrée (foule, intrusion, comptage), IK10, IP66.',
 210.00, 136.00, 25, 8,
 'open', now() + interval '30 days', 40, false),

-- ── Contrôle d'accès ────────────────────────────────────────

('VERSO-BASE',
 'Interphone IP vidéo Verso — Module de base',
 '2N', 'Contrôle d''accès',
 'Unité de base 2N IP Verso, caméra HD 125°, SIP, PoE 802.3af, OSDP, Bluetooth, module extensible (lecteur RFID, clavier, déport caméra). Coque acier inox.',
 590.00, 390.00, 12, 5,
 'open', now() + interval '35 days', 50, false),

('5427CK-G540',
 'Lecteur RFID double fréquence iCLASS SE',
 'HID', 'Contrôle d''accès',
 'Compatible iCLASS SE, iCLASS, MIFARE Classic/DESFire EV2, SEOS. Format Wiegand 26/37 bits ou OSDP v2. Plage de lecture 5-10 cm, IP65, LED tricolore, buzzer.',
 195.00, 124.00, 25, 18,
 'open', now() + interval '21 days', 60, false),

('BIOENTRY-W3',
 'Lecteur biométrique IP empreinte + RFID',
 'Suprema', 'Contrôle d''accès',
 'Capteur d'empreinte Suprema (FAR<0.0001%), RFID 125 kHz + 13.56 MHz, Wi-Fi + PoE, BioStar 2, OSDP, jusqu'à 50 000 empreintes, IP65, IK08.',
 680.00, 445.00, 10, 4,
 'open', now() + interval '28 days', 70, false),

-- ── Alarme & Intrusion ──────────────────────────────────────

('HUB-2-4G',
 'Centrale d'alarme hybride filaire/sans-fil 4G',
 'Ajax', 'Alarme & Intrusion',
 'Jusqu'à 100 appareils Ajax, 99 zones. Triple communication : Ethernet, Wi-Fi, GSM 4G (2 SIM). Batterie secours 12 h, EN 50131 Grade 2 Classe II. Cloud natif.',
 195.00, 127.00, 30, 22,
 'open', now() + interval '10 days', 80, true),

('DS-PD2-T10P-WE',
 'Détecteur PIR extérieur anti-masquage AX PRO',
 'Hikvision', 'Alarme & Intrusion',
 'Technologie double (PIR + micro-ondes), portée 10 m×12 m, anti-masquage actif, chiffrement AES-128, IP55, batterie 3 ans, fréquence 868 MHz.',
 89.00, 56.00, 50, 31,
 'open', now() + interval '14 days', 90, false),

('PREMIER-ELITE-64W',
 'Centrale alarme filaire/hybride 64 zones',
 'Texecom', 'Alarme & Intrusion',
 '64 zones filaires extensibles, module Wi-Fi inclus, EN 50131 Grade 3, alimentation 3 A intégrée, compatible App.* Connect. Boîtier plastique blanc.',
 380.00, 244.00, 8, 6,
 'open', now() + interval '20 days', 100, false),

-- ── Réseau & Infrastructure ─────────────────────────────────

('CBS350-24P-4G-EU',
 'Switch manageable PoE+ 24 ports + 4 SFP',
 'Cisco', 'Réseau & Infrastructure',
 '24 ports GbE PoE+ (budget 370 W), 4 uplinks SFP 1 G, VLAN 802.1Q, QoS, Spanning Tree, SNMP, SSH, rack 1U. Idéal déploiement caméras IP.',
 1250.00, 838.00, 8, 3,
 'open', now() + interval '42 days', 110, false),

('USW-48-POE',
 'Switch manageable UniFi 48 ports PoE 600 W',
 'Ubiquiti', 'Réseau & Infrastructure',
 '48 ports GbE PoE/PoE+ (600 W total), 4 uplinks SFP+ 10 G, UniFi OS, administrable cloud ou local, auto-provisioning. Montage rack 1U.',
 780.00, 518.00, 6, 4,
 'open', now() + interval '35 days', 120, false);
