'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Upload, Sparkles, CheckCircle, AlertCircle, FileText, Check } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { PREDEFINED_TEMPLATES } from '@/lib/pdf-templates'

const SANS = "'Helvetica Neue', Arial, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"

// ─── SVG mini-prévisualisations (fidèles au PDF généré) ─────────────────────────

// AGENCE — sans-serif, icône arrondie orange, DEVIS centré SOUS la ligne du haut, boîtes pointillées, table 2 colonnes, barre sombre
function PreviewAgence({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 160 220" className="w-full h-full" style={{ fontFamily: SANS }}>
      <rect width="160" height="220" fill="white" />
      <rect x="8" y="10" width="13" height="13" rx="3.5" fill={color} />
      <text x="24" y="20" fontSize="6.5" fontWeight="bold" fill="#111">MON ENTREPRISE</text>
      <text x="152" y="14" textAnchor="end" fontSize="4.5" fontWeight="bold" fill="#111">Réf. DEV-001</text>
      <text x="152" y="20" textAnchor="end" fontSize="4" fill="#666">Émis le 20/06/2026</text>
      <text x="152" y="26" textAnchor="end" fontSize="4" fontWeight="bold" fill={color}>Valable 30 jours</text>
      {/* DEVIS centré, bien EN DESSOUS — plus de chevauchement */}
      <text x="80" y="40" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#111">DEVIS</text>
      <line x1="8" y1="46" x2="152" y2="46" stroke="#e5e7eb" strokeWidth="0.5" />
      <rect x="8" y="52" width="66" height="28" fill="none" stroke="#ccc" strokeDasharray="3,2" strokeWidth="0.8" />
      <rect x="82" y="52" width="70" height="28" fill="none" stroke="#ccc" strokeDasharray="3,2" strokeWidth="0.8" />
      <text x="12" y="60" fontSize="4" fontWeight="bold" fill={color}>PRESTATAIRE</text>
      <text x="12" y="67" fontSize="5" fontWeight="bold" fill="#111">Mon Entreprise</text>
      <text x="12" y="73" fontSize="3.8" fill="#888">123 rue de la Paix, Paris</text>
      <text x="86" y="60" fontSize="4" fontWeight="bold" fill={color}>CLIENT</text>
      <text x="86" y="67" fontSize="5" fontWeight="bold" fill="#111">Dupont SAS</text>
      <text x="86" y="73" fontSize="3.8" fill="#888">contact@dupont.fr</text>
      <rect x="8" y="86" width="144" height="11" fill={color} />
      <text x="13" y="94" fontSize="4.5" fontWeight="bold" fill="white">PRESTATION</text>
      <text x="147" y="94" textAnchor="end" fontSize="4.5" fontWeight="bold" fill="white">PRIX</text>
      <text x="13" y="106" fontSize="5" fontWeight="bold" fill="#111">Installation électrique</text>
      <text x="13" y="112" fontSize="3.8" fill="#888">Mise aux normes tableau</text>
      <text x="147" y="106" textAnchor="end" fontSize="6" fontWeight="bold" fill={color}>1 200 €</text>
      <line x1="8" y1="117" x2="152" y2="117" stroke="#e5e7eb" strokeWidth="0.3" />
      <text x="13" y="126" fontSize="5" fontWeight="bold" fill="#111">Main d'œuvre</text>
      <text x="147" y="126" textAnchor="end" fontSize="6" fontWeight="bold" fill={color}>480 €</text>
      <rect x="8" y="133" width="144" height="15" fill="#1a1a1a" />
      <text x="14" y="143" fontSize="5" fontWeight="bold" fill="white">Total estimé</text>
      <text x="147" y="143" textAnchor="end" fontSize="7" fontWeight="bold" fill={color}>1 680 €</text>
      <rect x="8" y="154" width="144" height="18" fill="none" stroke="#ccc" strokeDasharray="3,2" strokeWidth="0.8" />
      <text x="13" y="161" fontSize="4" fontWeight="bold" fill={color}>CONDITIONS DE PAIEMENT</text>
      <circle cx="14" cy="167" r="1.4" fill={color} />
      <text x="18" y="169" fontSize="3.5" fill="#333">30% à la commande, solde à réception</text>
      <rect x="8" y="178" width="66" height="26" fill="none" stroke="#ccc" strokeDasharray="3,2" strokeWidth="0.8" />
      <rect x="82" y="178" width="70" height="26" fill="none" stroke="#ccc" strokeDasharray="3,2" strokeWidth="0.8" />
      <text x="13" y="185" fontSize="3.4" fontWeight="bold" fill={color}>BON POUR ACCORD</text>
      <text x="87" y="185" fontSize="3.4" fontWeight="bold" fill={color}>ÉMETTEUR</text>
      <text x="13" y="194" fontSize="3.4" fill="#aaa">Date : __________</text>
      <text x="87" y="194" fontSize="3.4" fill="#555">Date : 20/06/2026</text>
      <line x1="8" y1="210" x2="152" y2="210" stroke="#e5e7eb" strokeWidth="0.4" />
      <text x="80" y="216" textAnchor="middle" fontSize="2.8" fill="#aaa">SIRET : 990 572 117 00010 · TVA non applicable art. 293B CGI</text>
    </svg>
  )
}

// ARTISAN — sans-serif, barre bleue, table complète rayée, encadré coloré
function PreviewArtisan({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 160 220" className="w-full h-full" style={{ fontFamily: SANS }}>
      <rect width="160" height="220" fill="white" />
      <rect width="160" height="36" fill={color} />
      <text x="8" y="15" fontSize="8" fontWeight="bold" fill="white">MON ENTREPRISE</text>
      <text x="8" y="24" fontSize="4.2" fill="white" opacity="0.85">123 rue de la Paix · 06 12 34 56 78</text>
      <text x="152" y="12" textAnchor="end" fontSize="8" fontWeight="bold" fill="white">DEVIS</text>
      <text x="152" y="21" textAnchor="end" fontSize="5" fill="white" opacity="0.9">DEV-2026-001</text>
      <text x="152" y="29" textAnchor="end" fontSize="3.8" fill="white" opacity="0.85">Valable jusqu'au 20/07/2026</text>
      <rect x="8" y="44" width="66" height="32" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="82" y="44" width="70" height="32" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="12" y="51" fontSize="4" fontWeight="bold" fill={color}>PRESTATAIRE</text>
      <text x="12" y="58" fontSize="5" fontWeight="bold" fill="#111">Mon Entreprise</text>
      <text x="12" y="64" fontSize="3.5" fill="#555">123 rue de la Paix</text>
      <text x="12" y="70" fontSize="3.5" fill="#555">SIRET : 990 572 117 00010</text>
      <text x="86" y="51" fontSize="4" fontWeight="bold" fill={color}>CLIENT</text>
      <text x="86" y="58" fontSize="5" fontWeight="bold" fill="#111">Dupont SAS</text>
      <text x="86" y="64" fontSize="3.5" fill="#555">15 bd Haussmann, Paris</text>
      <text x="86" y="70" fontSize="3.5" fill="#555">contact@dupont.fr</text>
      <rect x="8" y="83" width="144" height="11" fill={color} />
      <text x="12" y="91" fontSize="3.4" fontWeight="bold" fill="white">DÉSIGNATION</text>
      <text x="86" y="91" fontSize="3.4" fontWeight="bold" fill="white">QTÉ</text>
      <text x="103" y="91" fontSize="3.4" fontWeight="bold" fill="white">P.U. HT</text>
      <text x="124" y="91" fontSize="3.4" fontWeight="bold" fill="white">TVA</text>
      <text x="149" y="91" textAnchor="end" fontSize="3.4" fontWeight="bold" fill="white">TOTAL HT</text>
      <rect x="8" y="94" width="144" height="14" fill="white" />
      <text x="12" y="103" fontSize="4.3" fontWeight="bold" fill="#111">Pose carrelage</text>
      <text x="86" y="103" fontSize="3.8" fill="#333">12 m²</text>
      <text x="103" y="103" fontSize="3.8" fill="#333">45,00 €</text>
      <text x="124" y="103" fontSize="3.8" fill="#333">10%</text>
      <text x="149" y="103" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">540,00 €</text>
      <rect x="8" y="108" width="144" height="14" fill="#eff6ff" />
      <text x="12" y="117" fontSize="4.3" fontWeight="bold" fill="#111">Fourniture matériaux</text>
      <text x="86" y="117" fontSize="3.8" fill="#333">1 forfait</text>
      <text x="103" y="117" fontSize="3.8" fill="#333">180,00 €</text>
      <text x="124" y="117" fontSize="3.8" fill="#333">10%</text>
      <text x="149" y="117" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">180,00 €</text>
      <text x="100" y="134" fontSize="4" fill="#555">Total HT</text>
      <text x="149" y="134" textAnchor="end" fontSize="4" fill="#555">720,00 €</text>
      <text x="100" y="141" fontSize="4" fill="#555">TVA (10%)</text>
      <text x="149" y="141" textAnchor="end" fontSize="4" fill="#555">72,00 €</text>
      <rect x="98" y="145" width="54" height="15" fill={color} />
      <text x="102" y="155" fontSize="4.3" fontWeight="bold" fill="white">TOTAL TTC</text>
      <text x="149" y="155" textAnchor="end" fontSize="5" fontWeight="bold" fill="white">792,00 €</text>
      <rect x="8" y="170" width="66" height="28" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <rect x="82" y="170" width="70" height="28" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
      <text x="13" y="177" fontSize="3.4" fontWeight="bold" fill={color}>BON POUR ACCORD</text>
      <text x="87" y="177" fontSize="3.4" fontWeight="bold" fill={color}>ÉMETTEUR</text>
      <text x="13" y="186" fontSize="3.4" fill="#aaa">Date : __________</text>
      <text x="87" y="186" fontSize="3.4" fill="#555">Date : 20/06/2026</text>
      <line x1="8" y1="206" x2="152" y2="206" stroke="#e5e7eb" strokeWidth="0.4" />
      <text x="80" y="212" textAnchor="middle" fontSize="2.8" fill="#aaa">SIRET : 990 572 117 00010</text>
    </svg>
  )
}

// MINIMALISTE — SERIF, titre fin, encadrés en simples traits, total inline
function PreviewMinimaliste({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 160 220" className="w-full h-full" style={{ fontFamily: SERIF }}>
      <rect width="160" height="220" fill="white" />
      <text x="10" y="22" fontSize="7.5" fontWeight="bold" fill="#111" letterSpacing="0.5">MON ENTREPRISE</text>
      <text x="150" y="24" textAnchor="end" fontSize="17" fontWeight="bold" fill="#111">DEVIS</text>
      <text x="10" y="31" fontSize="4" fill="#666">Réf. DEV-001 · Émis le 20/06/2026</text>
      <line x1="10" y1="36" x2="150" y2="36" stroke="#111" strokeWidth="1" />
      <line x1="10" y1="44" x2="72" y2="44" stroke="#aaa" strokeWidth="0.8" />
      <line x1="10" y1="76" x2="72" y2="76" stroke="#aaa" strokeWidth="0.8" />
      <line x1="82" y1="44" x2="150" y2="44" stroke="#aaa" strokeWidth="0.8" />
      <line x1="82" y1="76" x2="150" y2="76" stroke="#aaa" strokeWidth="0.8" />
      <text x="14" y="51" fontSize="4" fontWeight="bold" fill={color}>PRESTATAIRE</text>
      <text x="14" y="58" fontSize="5.5" fontWeight="bold" fill="#111">Mon Entreprise</text>
      <text x="14" y="64" fontSize="3.5" fill="#555">Paris, France</text>
      <text x="14" y="70" fontSize="3.5" fill="#555">contact@entreprise.fr</text>
      <text x="86" y="51" fontSize="4" fontWeight="bold" fill={color}>CLIENT</text>
      <text x="86" y="58" fontSize="5.5" fontWeight="bold" fill="#111">Dupont SAS</text>
      <text x="86" y="64" fontSize="3.5" fill="#555">Paris</text>
      <line x1="10" y1="86" x2="150" y2="86" stroke="#111" strokeWidth="0.8" />
      <text x="14" y="92" fontSize="3.4" fontWeight="bold" fill={color}>DÉSIGNATION</text>
      <text x="100" y="92" fontSize="3.4" fontWeight="bold" fill={color}>QTÉ</text>
      <text x="118" y="92" fontSize="3.4" fontWeight="bold" fill={color}>P.U. HT</text>
      <text x="149" y="92" textAnchor="end" fontSize="3.4" fontWeight="bold" fill={color}>TOTAL HT</text>
      <line x1="10" y1="95" x2="150" y2="95" stroke="#111" strokeWidth="0.8" />
      <text x="14" y="104" fontSize="5" fontWeight="bold" fill="#111">Conception graphique</text>
      <text x="100" y="104" fontSize="3.8" fill="#333">1</text>
      <text x="118" y="104" fontSize="3.8" fill="#333">800,00 €</text>
      <text x="149" y="104" textAnchor="end" fontSize="5" fontWeight="bold" fill="#111">800,00 €</text>
      <line x1="10" y1="109" x2="150" y2="109" stroke="#e5e7eb" strokeWidth="0.3" />
      <text x="14" y="118" fontSize="5" fontWeight="bold" fill="#111">Développement</text>
      <text x="100" y="118" fontSize="3.8" fill="#333">1</text>
      <text x="118" y="118" fontSize="3.8" fill="#333">1 200 €</text>
      <text x="149" y="118" textAnchor="end" fontSize="5" fontWeight="bold" fill="#111">1 200 €</text>
      <text x="110" y="130" fontSize="4" fill="#555">Total HT</text>
      <text x="149" y="130" textAnchor="end" fontSize="4" fill="#555">2 000,00 €</text>
      <line x1="108" y1="134" x2="150" y2="134" stroke={color} strokeWidth="1.5" />
      <text x="110" y="141" fontSize="5" fontWeight="bold" fill={color}>TOTAL TTC</text>
      <text x="149" y="141" textAnchor="end" fontSize="6" fontWeight="bold" fill={color}>2 000 €</text>
      <line x1="10" y1="158" x2="72" y2="158" stroke="#aaa" strokeWidth="0.8" />
      <line x1="10" y1="190" x2="72" y2="190" stroke="#aaa" strokeWidth="0.8" />
      <line x1="82" y1="158" x2="150" y2="158" stroke="#aaa" strokeWidth="0.8" />
      <line x1="82" y1="190" x2="150" y2="190" stroke="#aaa" strokeWidth="0.8" />
      <text x="14" y="165" fontSize="3.4" fontWeight="bold" fill={color}>BON POUR ACCORD</text>
      <text x="86" y="165" fontSize="3.4" fontWeight="bold" fill={color}>ÉMETTEUR</text>
      <text x="14" y="174" fontSize="3.4" fill="#aaa">Date : __________</text>
      <text x="86" y="174" fontSize="3.4" fill="#555">Date : 20/06/2026</text>
      <line x1="10" y1="206" x2="150" y2="206" stroke="#e5e7eb" strokeWidth="0.4" />
      <text x="80" y="212" textAnchor="middle" fontSize="2.8" fill="#aaa">SIRET : 990 572 117 00010</text>
    </svg>
  )
}

// PREMIUM — SERIF, ARRONDI, en-tête sombre + or, bandeau client unique (banner), total barre arrondie
function PreviewPremium({ color }: { color: string }) {
  const dark = '#13131f'
  const cream = '#faf6ec'
  return (
    <svg viewBox="0 0 160 220" className="w-full h-full" style={{ fontFamily: SERIF }}>
      <rect width="160" height="220" fill="white" />
      {/* En-tête sombre arrondi */}
      <rect x="8" y="10" width="144" height="34" rx="8" fill={dark} />
      <rect x="15" y="17" width="18" height="18" rx="5" fill={color} />
      <text x="24" y="30" textAnchor="middle" fontSize="9" fontWeight="bold" fill={dark}>M</text>
      <text x="38" y="25" fontSize="7.5" fontWeight="bold" fill="white">MON ENTREPRISE</text>
      <text x="38" y="32" fontSize="3.5" fill="#999">Paris · 06 12 34 56 78</text>
      <text x="145" y="22" textAnchor="end" fontSize="11" fontWeight="bold" fill={color}>DEVIS</text>
      <text x="145" y="31" textAnchor="end" fontSize="4" fill="#ccc">Réf. DEV-2026-001</text>
      <text x="145" y="37" textAnchor="end" fontSize="3.5" fill={color}>Valable jusqu'au 20/07</text>
      {/* Bandeau unique (banner) — fond crème, séparateur central */}
      <rect x="8" y="52" width="144" height="34" rx="8" fill={cream} />
      <line x1="80" y1="60" x2="80" y2="78" stroke="#d8cba0" strokeWidth="0.7" />
      <text x="16" y="61" fontSize="3.8" fontWeight="bold" fill={color}>PRESTATAIRE</text>
      <text x="16" y="68" fontSize="5" fontWeight="bold" fill="#111">Mon Entreprise</text>
      <text x="16" y="74" fontSize="3.4" fill="#666">Paris, France</text>
      <text x="16" y="80" fontSize="3.4" fill="#666">contact@entreprise.fr</text>
      <text x="86" y="61" fontSize="3.8" fontWeight="bold" fill={color}>CLIENT</text>
      <text x="86" y="68" fontSize="5" fontWeight="bold" fill="#111">Dupont SAS</text>
      <text x="86" y="74" fontSize="3.4" fill="#666">15 bd Haussmann, Paris</text>
      {/* Table en-tête sombre arrondi */}
      <rect x="8" y="92" width="144" height="11" rx="5" fill={dark} />
      <text x="12" y="100" fontSize="3.4" fontWeight="bold" fill={color}>DÉSIGNATION</text>
      <text x="86" y="100" fontSize="3.4" fontWeight="bold" fill={color}>QTÉ</text>
      <text x="103" y="100" fontSize="3.4" fontWeight="bold" fill={color}>P.U. HT</text>
      <text x="124" y="100" fontSize="3.4" fontWeight="bold" fill={color}>TVA</text>
      <text x="149" y="100" textAnchor="end" fontSize="3.4" fontWeight="bold" fill={color}>TOTAL HT</text>
      <text x="12" y="112" fontSize="4.3" fontWeight="bold" fill="#111">Rénovation salle de bain</text>
      <text x="86" y="112" fontSize="3.8" fill="#333">1</text>
      <text x="103" y="112" fontSize="3.8" fill="#333">3 500 €</text>
      <text x="124" y="112" fontSize="3.8" fill="#333">10%</text>
      <text x="149" y="112" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">3 500 €</text>
      <line x1="8" y1="117" x2="152" y2="117" stroke="#e5e7eb" strokeWidth="0.3" />
      <text x="12" y="126" fontSize="4.3" fontWeight="bold" fill="#111">Main d'œuvre spécialisée</text>
      <text x="86" y="126" fontSize="3.8" fill="#333">1</text>
      <text x="103" y="126" fontSize="3.8" fill="#333">1 200 €</text>
      <text x="124" y="126" fontSize="3.8" fill="#333">10%</text>
      <text x="149" y="126" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">1 200 €</text>
      {/* Total barre sombre arrondie */}
      <rect x="8" y="134" width="144" height="16" rx="8" fill={dark} />
      <text x="15" y="144" fontSize="5" fontWeight="bold" fill="white">Total estimé</text>
      <text x="146" y="144" textAnchor="end" fontSize="7" fontWeight="bold" fill={color}>5 170 €</text>
      {/* Signatures crème arrondies */}
      <rect x="8" y="160" width="66" height="26" rx="8" fill={cream} />
      <rect x="82" y="160" width="70" height="26" rx="8" fill={cream} />
      <text x="14" y="167" fontSize="3.3" fontWeight="bold" fill={color}>BON POUR ACCORD</text>
      <text x="88" y="167" fontSize="3.3" fontWeight="bold" fill={color}>ÉMETTEUR</text>
      <text x="14" y="176" fontSize="3.3" fill="#999">Date : __________</text>
      <text x="88" y="176" fontSize="3.3" fill="#666">Date : 20/06/2026</text>
      <line x1="8" y1="196" x2="152" y2="196" stroke="#e5e7eb" strokeWidth="0.4" />
      <text x="80" y="202" textAnchor="middle" fontSize="2.8" fill="#aaa">SIRET : 990 572 117 00010</text>
    </svg>
  )
}

// CLASSIQUE — SERIF, blocs EMPILÉS (stacked) pleine largeur, barre navy, table rayée
function PreviewClassique({ color }: { color: string }) {
  const bg = '#eef2f7'
  return (
    <svg viewBox="0 0 160 220" className="w-full h-full" style={{ fontFamily: SERIF }}>
      <rect width="160" height="220" fill="white" />
      <rect width="160" height="34" fill={color} />
      <text x="8" y="15" fontSize="8" fontWeight="bold" fill="white">MON ENTREPRISE</text>
      <text x="8" y="23" fontSize="3.8" fill="white" opacity="0.85">Paris · contact@entreprise.fr</text>
      <text x="152" y="11" textAnchor="end" fontSize="9" fontWeight="bold" fill="white">DEVIS</text>
      <text x="152" y="20" textAnchor="end" fontSize="5" fill="white" opacity="0.9">DEV-2026-001</text>
      <text x="152" y="28" textAnchor="end" fontSize="3.8" fill="white" opacity="0.85">Échéance : 20/07/2026</text>
      {/* Bloc PRESTATAIRE pleine largeur */}
      <rect x="8" y="42" width="144" height="26" fill={bg} />
      <text x="12" y="49" fontSize="3.8" fontWeight="bold" fill={color}>PRESTATAIRE</text>
      <text x="12" y="56" fontSize="5" fontWeight="bold" fill="#111">Mon Entreprise</text>
      <text x="12" y="63" fontSize="3.5" fill="#555">123 rue de la Paix, Paris · SIRET : 990 572 117 00010</text>
      {/* Bloc CLIENT pleine largeur (empilé dessous) */}
      <rect x="8" y="72" width="144" height="26" fill={bg} />
      <text x="12" y="79" fontSize="3.8" fontWeight="bold" fill={color}>CLIENT</text>
      <text x="12" y="86" fontSize="5" fontWeight="bold" fill="#111">Dupont SAS</text>
      <text x="12" y="93" fontSize="3.5" fill="#555">15 bd Haussmann, 75009 Paris · contact@dupont.fr</text>
      {/* Table rayée */}
      <rect x="8" y="102" width="144" height="11" fill={color} />
      <text x="12" y="110" fontSize="3.4" fontWeight="bold" fill="white">DÉSIGNATION</text>
      <text x="86" y="110" fontSize="3.4" fontWeight="bold" fill="white">QTÉ</text>
      <text x="103" y="110" fontSize="3.4" fontWeight="bold" fill="white">P.U. HT</text>
      <text x="124" y="110" fontSize="3.4" fontWeight="bold" fill="white">TVA</text>
      <text x="149" y="110" textAnchor="end" fontSize="3.4" fontWeight="bold" fill="white">TOTAL HT</text>
      <rect x="8" y="113" width="144" height="12" fill={bg} />
      <text x="12" y="121" fontSize="4.3" fontWeight="bold" fill="#111">Conseil en gestion</text>
      <text x="86" y="121" fontSize="3.8" fill="#333">5 h</text>
      <text x="103" y="121" fontSize="3.8" fill="#333">120 €</text>
      <text x="124" y="121" fontSize="3.8" fill="#333">20%</text>
      <text x="149" y="121" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">600 €</text>
      <rect x="8" y="125" width="144" height="12" fill="white" />
      <text x="12" y="133" fontSize="4.3" fontWeight="bold" fill="#111">Déclarations fiscales</text>
      <text x="86" y="133" fontSize="3.8" fill="#333">1</text>
      <text x="103" y="133" fontSize="3.8" fill="#333">350 €</text>
      <text x="124" y="133" fontSize="3.8" fill="#333">20%</text>
      <text x="149" y="133" textAnchor="end" fontSize="4.3" fontWeight="bold" fill="#111">350 €</text>
      <text x="100" y="148" fontSize="4" fill="#555">Total HT</text>
      <text x="149" y="148" textAnchor="end" fontSize="4" fill="#555">950,00 €</text>
      <text x="100" y="155" fontSize="4" fill="#555">TVA (20%)</text>
      <text x="149" y="155" textAnchor="end" fontSize="4" fill="#555">190,00 €</text>
      <rect x="96" y="159" width="56" height="15" fill={color} />
      <text x="100" y="169" fontSize="4.3" fontWeight="bold" fill="white">TOTAL TTC</text>
      <text x="149" y="169" textAnchor="end" fontSize="5" fontWeight="bold" fill="white">1 140 €</text>
      <rect x="8" y="182" width="66" height="24" fill={bg} />
      <rect x="82" y="182" width="70" height="24" fill={bg} />
      <text x="13" y="189" fontSize="3.3" fontWeight="bold" fill={color}>BON POUR ACCORD</text>
      <text x="87" y="189" fontSize="3.3" fontWeight="bold" fill={color}>ÉMETTEUR</text>
      <text x="13" y="198" fontSize="3.3" fill="#999">Date : __________</text>
      <text x="87" y="198" fontSize="3.3" fill="#555">Date : 20/06/2026</text>
      <line x1="8" y1="211" x2="152" y2="211" stroke="#e5e7eb" strokeWidth="0.4" />
      <text x="80" y="217" textAnchor="middle" fontSize="2.7" fill="#aaa">SIRET : 990 572 117 00010</text>
    </svg>
  )
}

const TEMPLATE_PREVIEWS: Record<string, React.FC<{ color: string }>> = {
  agence: PreviewAgence,
  artisan: PreviewArtisan,
  minimaliste: PreviewMinimaliste,
  premium: PreviewPremium,
  classique: PreviewClassique,
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────

type Tab = 'choisir' | 'importer'

export default function ModeleDocumentPage() {
  const [tab, setTab] = useState<Tab>('choisir')
  const [selectedId, setSelectedId] = useState<string>('agence')
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'upload' | 'analysing' | 'done'>('upload')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('template_style').eq('user_id', user.id).single().then(({ data }) => {
        const tid = data?.template_style?.template_id
        if (tid && tid !== 'custom') setSelectedId(tid)
        if (tid === 'custom') setTab('importer')
      })
    })
  }, [])

  async function handleSaveTemplate() {
    setSaving(true)
    try {
      const res = await fetch('/api/modele/choisir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedId }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(`Template "${PREDEFINED_TEMPLATES[selectedId]?.name}" appliqué`)
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleAnalyse() {
    if (!file) return
    setStep('analysing')
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/modele/analyser', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Erreur'); setStep('upload'); return }
      setStep('done')
      toast.success('Modèle analysé et appliqué ! Vos futurs devis reprendront ce style.')
    } catch {
      setError('Erreur réseau')
      setStep('upload')
    }
  }

  const templates = Object.values(PREDEFINED_TEMPLATES)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/parametres">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" /> Retour</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modèle de documents</h1>
          <p className="text-sm text-gray-500">Choisissez un style prédéfini ou importez votre propre modèle</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('choisir')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'choisir' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Choisir un style
        </button>
        <button
          onClick={() => setTab('importer')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'importer' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Importer mon modèle
        </button>
      </div>

      {tab === 'choisir' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {templates.map((tmpl) => {
              const Preview = TEMPLATE_PREVIEWS[tmpl.id]
              const isSelected = selectedId === tmpl.id
              return (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedId(tmpl.id)}
                  className={`relative text-left rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                    isSelected ? 'border-blue-500 shadow-md bg-blue-50/30' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center z-10">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                  <div className="w-full aspect-[3/4] rounded-lg overflow-hidden border border-gray-100 bg-white shadow-sm mb-2">
                    {Preview && <Preview color={tmpl.primaryColor} />}
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{tmpl.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{tmpl.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{tmpl.domain}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-white shadow" style={{ backgroundColor: tmpl.primaryColor }} />
                    <span className="text-xs text-gray-400">{tmpl.primaryColor}</span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSaveTemplate} disabled={saving} className="gap-2">
              {saving ? 'Enregistrement...' : `Appliquer le style "${PREDEFINED_TEMPLATES[selectedId]?.name}"`}
            </Button>
            <p className="text-xs text-gray-500">Ce style sera utilisé pour tous vos nouveaux devis et factures</p>
          </div>
        </div>
      )}

      {tab === 'importer' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium">Comment ça marche ?</p>
            <p className="text-xs mt-1">L'IA analyse votre devis ou facture existant et reproduit <strong>votre mise en page</strong> : style d'en-tête, encadrés, colonnes du tableau, position des totaux, couleurs et police.</p>
          </div>

          {step === 'upload' && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setError(null) } }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => inputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                >
                  {file ? (
                    <div className="space-y-1">
                      <FileText className="w-10 h-10 text-blue-500 mx-auto" />
                      <p className="font-medium text-gray-800 text-sm">{file.name}</p>
                      <p className="text-xs text-gray-400">Cliquez pour changer</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                      <p className="font-medium text-gray-700">Glissez votre devis ou facture ici</p>
                      <p className="text-sm text-gray-400">PNG, JPG ou PDF — max 10 Mo</p>
                    </div>
                  )}
                </div>
                <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null) } }} className="hidden" />
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                  </div>
                )}
                <Button onClick={handleAnalyse} disabled={!file} className="w-full gap-2">
                  <Sparkles className="w-4 h-4" /> Analyser et appliquer ce style
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 'analysing' && (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto animate-pulse">
                  <Sparkles className="w-7 h-7 text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900">Analyse en cours...</p>
                <p className="text-sm text-gray-500">Claude lit votre mise en page et reproduit le style</p>
                <p className="text-xs text-gray-400">30 à 60 secondes</p>
              </CardContent>
            </Card>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-sm text-green-700 font-medium">
                <CheckCircle className="w-5 h-5" /> Style importé et appliqué — vos prochains devis reprendront ce design
              </div>
              <Button variant="outline" onClick={() => { setStep('upload'); setFile(null); setError(null) }}>
                Importer un autre modèle
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
