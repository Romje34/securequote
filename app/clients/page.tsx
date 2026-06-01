"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Client = {
  id: number;
  name: string;
  email: string;
  phone: string;
};

export default function Clients() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [clients, setClients] = useState<Client[]>([]);

  // 🔄 Charger les clients
  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("id", { ascending: false });

    if (!error) {
      setClients(data || []);
    }
  };

  // ➕ Ajouter client
  const addClient = async () => {
    if (!name || !email || !phone) {
      alert("Remplis tous les champs");
      return;
    }

    const { error } = await supabase
      .from("clients")
      .insert([{ name, email, phone }]);

    if (error) {
      alert("Erreur : " + error.message);
    } else {
      alert("Client ajouté avec succès !");
      setName("");
      setEmail("");
      setPhone("");
      fetchClients(); // refresh liste
    }
  };

  // 🚀 chargement initial
  useEffect(() => {
    fetchClients();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Clients</h1>

      <input
        placeholder="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <br /><br />

      <button onClick={addClient}>
        Ajouter
      </button>

      <hr />

      <h2>Liste des clients</h2>

      {clients.length === 0 ? (
        <p>Aucun client</p>
      ) : (
        clients.map((c) => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            👤 {c.name} — {c.email} — {c.phone}
          </div>
        ))
      )}
    </div>
  );
}