"use client";

// Un solo módulo con dos pestañas: el conteo (acción) y la merma (resultado).
import { useState } from "react";
import { ConteoFisicoClient } from "./ConteoFisicoClient";
import { MermaClient } from "../merma/MermaClient";

const TABS = [
  { id: "conteo", label: "Conteo" },
  { id: "merma", label: "Merma (historial)" },
] as const;

export function ConteoTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("conteo");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-xs uppercase tracking-widest ring-1 ${
              tab === t.id
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "conteo" ? <ConteoFisicoClient /> : <MermaClient />}
    </div>
  );
}
