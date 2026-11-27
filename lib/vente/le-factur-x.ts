/**
 * LA FACTURE ÉLECTRONIQUE — PUR (Antoine, 27/11 : « des factures électroniques agréées »). Le XML Cross Industry Invoice
 * (UN/CEFACT D16B) d'une commande payée, au profil EN 16931 de Factur-X : la même commande que la facture lisible
 * (`la-facture.ts`), ses montants recalculés par les règles de la norme (une base par taux, la TVA arrondie sur cette base,
 * l'écart d'un centime avec ce qui a été payé dit en arrondi). Ce qui manque à la norme (le n° de TVA du vendeur assujetti,
 * l'adresse de l'acheteur) n'est jamais inventé : la facture électronique n'est pas rendue, et le manque est nommé.
 *
 * Ce qu'il remplace : rien ; la boutique ne rendait qu'une page HTML, qu'aucune plateforme agréée ne lit.
 */
import type { Boutique } from './la-boutique';
import type { CommandeFacturee } from './la-facture';

export const GUIDE_EN16931 = 'urn:cen.eu:en16931:2017';
/** La mention d'une franchise en base (France, art. 293 B du CGI), et son code d'exonération. */
const FRANCHISE = { raison: 'TVA non applicable, art. 293 B du CGI', code: 'VATEX-FR-FRANCHISE' };

/** Le SIREN d'une immatriculation : 9 chiffres (SIREN) ou 14 (SIRET), clé de Luhn juste ; sinon `null`. */
export function leSiren(immatriculation: string | null | undefined): string | null {
  const n = (immatriculation ?? '').replace(/[\s.-]/g, '');
  const chiffres = /^\d{14}$/.test(n) ? n : /^\d{9}$/.test(n) ? n : (/(?:^|\D)(\d{9}|\d{14})(?:\D|$)/.exec(immatriculation ?? '')?.[1] ?? '');
  const luhn = (s: string) => [...s].reverse().reduce((t, c, i) => { const d = Number(c) * (i % 2 ? 2 : 1); return t + (d > 9 ? d - 9 : d); }, 0) % 10 === 0;
  if (!chiffres || !luhn(chiffres.slice(0, 9))) return null;
  return chiffres.slice(0, 9);
}

/** Un n° de TVA intracommunautaire relu : deux lettres de pays puis 2 à 13 caractères ; sinon `null`. */
export function laTva(brut: string | null | undefined): string | null {
  const t = (brut ?? '').replace(/[\s.-]/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(t) ? t : null;
}

export interface VendeurElectronique { readonly nom: string; readonly adresse: string | null; readonly pays: string; readonly siren: string | null; readonly tva: string | null; readonly courriel: string | null }

const x = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const m = (centimes: number): string => (centimes / 100).toFixed(2);
const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

interface LigneNette { readonly libelle: string; readonly quantite: number; readonly netCentimes: number; readonly taux: number }

/**
 * Les lignes nettes et une base par taux : chaque taux a son TTC (articles, et sa part de l'envoi au prorata, comme la
 * ventilation de la commande), sa base HT arrondie, sa TVA = base × taux arrondie (BR-CO-17) ; la somme des lignes nettes
 * d'un taux vaut sa base, la dernière ligne du taux portant l'écart d'arrondi (BR-S-08).
 */
function lesMontants(c: CommandeFacturee, franchise: boolean, envoiLibelle: string) {
  const lignes = (c.vente_lignes ?? []).map((l) => ({
    libelle: String(l.libelle ?? '').slice(0, 250) || '—', quantite: typeof l.quantite === 'number' && l.quantite > 0 ? l.quantite : 1,
    ttc: typeof l.centimes === 'number' ? l.centimes : 0, taux: franchise ? 0 : typeof l.taux === 'number' ? l.taux : null,
  }));
  if (lignes.some((l) => l.taux === null)) return null;
  const envoi = Math.max(0, c.vente_livraison_centimes ?? 0);
  const parTaux = new Map<number, number>();
  for (const l of lignes) parTaux.set(l.taux!, (parTaux.get(l.taux!) ?? 0) + l.ttc * l.quantite);
  const articles = [...parTaux.values()].reduce((a, b) => a + b, 0);
  const ordre = [...parTaux.keys()].sort((a, b) => b - a);
  let reste = envoi;
  const taux = ordre.map((t, i) => {
    const partEnvoi = i === ordre.length - 1 ? reste : articles > 0 ? Math.round((envoi * parTaux.get(t)!) / articles) : 0;
    reste -= partEnvoi;
    const ttc = parTaux.get(t)! + partEnvoi;
    const base = Math.round((ttc * 100) / (100 + t));
    return { taux: t, base, tva: Math.round((base * t) / 100), partEnvoi };
  });
  const nettes: LigneNette[] = [];
  for (const t of taux) {
    const duTaux = lignes.filter((l) => l.taux === t.taux).map((l) => ({ libelle: l.libelle, quantite: l.quantite, taux: t.taux, netCentimes: Math.round((l.ttc * l.quantite * 100) / (100 + t.taux)) }));
    if (t.partEnvoi > 0) duTaux.push({ libelle: envoiLibelle, quantite: 1, taux: t.taux, netCentimes: Math.round((t.partEnvoi * 100) / (100 + t.taux)) });
    const ecart = t.base - duTaux.reduce((s, l) => s + l.netCentimes, 0);
    if (duTaux.length > 0) duTaux[duTaux.length - 1] = { ...duTaux[duTaux.length - 1]!, netCentimes: duTaux[duTaux.length - 1]!.netCentimes + ecart };
    nettes.push(...duTaux);
  }
  return { nettes, taux };
}

export type FactureElectronique = { readonly forme: 'xml'; readonly xml: string } | { readonly forme: 'manque'; readonly manques: readonly string[] };

/** Le XML Factur-X (profil EN 16931) d'une commande facturée ; ou ce qui manque pour qu'il soit conforme. PURE. */
export function leXmlFacturX(b: Boutique, v: VendeurElectronique, c: CommandeFacturee, envoiLibelle = 'Livraison'): FactureElectronique {
  const franchise = !b.tva.assujettie;
  const a = (c.vente_adresse ?? {}) as Record<string, unknown>;
  const acheteur = { nom: texte(a.societe) ?? texte(c.vente_nom), ligne1: texte(a.line1), ligne2: texte(a.line2), cp: texte(a.postal_code), ville: texte(a.city),
    pays: texte(a.country), siren: leSiren(texte(a.siren)), tva: laTva(texte(a.tva)), courriel: texte(c.vente_courriel) };
  const manques: string[] = [];
  if (!franchise && !v.tva) manques.push('le n° de TVA intracommunautaire du vendeur');
  if (franchise && !v.tva && !v.siren) manques.push('le SIREN du vendeur (son immatriculation)');
  if (!acheteur.nom) manques.push('le nom de l’acheteur');
  if (!acheteur.pays) manques.push('l’adresse de l’acheteur (une commande retirée sur place n’en a pas)');
  const montants = lesMontants(c, franchise, envoiLibelle);
  if (!montants) manques.push('le taux de TVA de chaque article');
  const date = new Date(c.vente_facture.emise_le);
  if (Number.isNaN(date.getTime())) manques.push('la date de la facture');
  if (manques.length > 0 || !montants) return { forme: 'manque', manques };

  const devise = (c.vente_devise ?? b.devise).toUpperCase();
  const jour = date.toISOString().slice(0, 10).replace(/-/g, '');
  const categorie = franchise ? 'E' : 'S';
  const lignesXml = montants.nettes.map((l, i) => {
    const prixUnitaire = (l.netCentimes / 100 / l.quantite).toFixed(4);
    return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`
      + `<ram:SpecifiedTradeProduct><ram:Name>${x(l.libelle)}</ram:Name></ram:SpecifiedTradeProduct>`
      + `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${prixUnitaire}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`
      + `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${l.quantite}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`
      + `<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${categorie}</ram:CategoryCode><ram:RateApplicablePercent>${l.taux}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
      + `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${m(l.netCentimes)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>`
      + '</ram:IncludedSupplyChainTradeLineItem>';
  }).join('');
  const adresse = (o: { ligne1?: string | null; ligne2?: string | null; cp?: string | null; ville?: string | null; pays: string }) => '<ram:PostalTradeAddress>'
    + (o.cp ? `<ram:PostcodeCode>${x(o.cp)}</ram:PostcodeCode>` : '') + (o.ligne1 ? `<ram:LineOne>${x(o.ligne1)}</ram:LineOne>` : '')
    + (o.ligne2 ? `<ram:LineTwo>${x(o.ligne2)}</ram:LineTwo>` : '') + (o.ville ? `<ram:CityName>${x(o.ville)}</ram:CityName>` : '')
    + `<ram:CountryID>${x(o.pays)}</ram:CountryID></ram:PostalTradeAddress>`;
  const courriel = (c2: string | null) => (c2 ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(c2)}</ram:URIID></ram:URIUniversalCommunication>` : '');
  const vendeur = `<ram:SellerTradeParty><ram:Name>${x(v.nom)}</ram:Name>`
    + (v.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${v.siren}</ram:ID></ram:SpecifiedLegalOrganization>` : '')
    + adresse({ ligne1: v.adresse, pays: v.pays }) + courriel(v.courriel)
    + (v.tva ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${v.tva}</ram:ID></ram:SpecifiedTaxRegistration>`
      : `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${v.siren}</ram:ID></ram:SpecifiedTaxRegistration>`)
    + '</ram:SellerTradeParty>';
  const leAcheteur = `<ram:BuyerTradeParty><ram:Name>${x(acheteur.nom!)}</ram:Name>`
    + (acheteur.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${acheteur.siren}</ram:ID></ram:SpecifiedLegalOrganization>` : '')
    + adresse({ ligne1: acheteur.ligne1, ligne2: acheteur.ligne2, cp: acheteur.cp, ville: acheteur.ville, pays: acheteur.pays! }) + courriel(acheteur.courriel)
    + (acheteur.tva ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${acheteur.tva}</ram:ID></ram:SpecifiedTaxRegistration>` : '')
    + '</ram:BuyerTradeParty>';
  const taxes = montants.taux.map((t) => `<ram:ApplicableTradeTax><ram:CalculatedAmount>${m(t.tva)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>`
    + (franchise ? `<ram:ExemptionReason>${x(FRANCHISE.raison)}</ram:ExemptionReason>` : '')
    + `<ram:BasisAmount>${m(t.base)}</ram:BasisAmount><ram:CategoryCode>${categorie}</ram:CategoryCode>`
    + (franchise ? `<ram:ExemptionReasonCode>${FRANCHISE.code}</ram:ExemptionReasonCode>` : '')
    + `<ram:RateApplicablePercent>${t.taux}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join('');
  const base = montants.taux.reduce((s, t) => s + t.base, 0), tva = montants.taux.reduce((s, t) => s + t.tva, 0);
  const paye = typeof c.vente_montant_centimes === 'number' ? c.vente_montant_centimes : base + tva;
  const arrondi = paye - (base + tva);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"'
    + ' xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">'
    + `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDE_EN16931}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>`
    + `<rsm:ExchangedDocument><ram:ID>${x(c.vente_facture.numero)}</ram:ID><ram:TypeCode>380</ram:TypeCode>`
    + `<ram:IssueDateTime><udt:DateTimeString format="102">${jour}</udt:DateTimeString></ram:IssueDateTime>`
    + (franchise ? `<ram:IncludedNote><ram:Content>${x(FRANCHISE.raison)}</ram:Content></ram:IncludedNote>` : '') + '</rsm:ExchangedDocument>'
    + `<rsm:SupplyChainTradeTransaction>${lignesXml}`
    + `<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>${x(c.id)}</ram:BuyerReference>${vendeur}${leAcheteur}</ram:ApplicableHeaderTradeAgreement>`
    + `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${jour}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>`
    + `<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>${x(devise)}</ram:InvoiceCurrencyCode>`
    + '<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>48</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>'
    + taxes
    + '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>'
    + `<ram:LineTotalAmount>${m(base)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${m(base)}</ram:TaxBasisTotalAmount>`
    + `<ram:TaxTotalAmount currencyID="${x(devise)}">${m(tva)}</ram:TaxTotalAmount>`
    + (arrondi !== 0 ? `<ram:RoundingAmount>${m(arrondi)}</ram:RoundingAmount>` : '')
    + `<ram:GrandTotalAmount>${m(base + tva)}</ram:GrandTotalAmount><ram:TotalPrepaidAmount>${m(paye)}</ram:TotalPrepaidAmount><ram:DuePayableAmount>0.00</ram:DuePayableAmount>`
    + '</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>\n';
  return { forme: 'xml', xml };
}
