/**
 * La facture électronique (Antoine, 27/11) : le XML Factur-X (CII D16B, profil EN 16931) d'une commande payée. Avant : la
 * boutique ne rendait qu'une page HTML, qu'aucune plateforme agréée ne lit. Ici :
 *  - le XML tient le schéma officiel UN/CEFACT D16B (xmllint, `test/fixtures/cii-d16b`, copie du dépôt ConnectingEurope) ;
 *  - ses montants tiennent les règles de calcul de la norme (BR-CO-10, 13, 15, 16, 17 ; BR-S-08), deux taux, envoi au prorata,
 *    arrondi d'un centime dit en `RoundingAmount`, vendeur en franchise ;
 *  - ce qui manque à la conformité est nommé, jamais inventé ; l'acheteur pro (société, SIREN, TVA) est relu au paiement.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laTva, leSiren, leXmlFacturX, type VendeurElectronique } from '@/lib/vente/le-factur-x';
import { lireLesCoordonnees } from '@/lib/vente/le-chiffrage';
import type { Boutique } from '@/lib/vente/la-boutique';
import type { CommandeFacturee } from '@/lib/vente/la-facture';

const XMLLINT = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const XSD = join(__dirname, '../fixtures/cii-d16b/CrossIndustryInvoice_100pD16B.xsd');
const valide = (xml: string): string => {
  const f = join(mkdtempSync(join(tmpdir(), 'facturx-')), 'f.xml');
  writeFileSync(f, xml);
  try { execFileSync('xmllint', ['--noout', '--schema', XSD, f], { stdio: 'pipe' }); return 'valide'; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); }
};

const boutique = (assujettie: boolean) => ({ tva: { assujettie, taux: null }, devise: 'EUR', langue: 'fr' }) as unknown as Boutique;
const VENDEUR: VendeurElectronique = { nom: 'Atelier Exemple SAS', adresse: '3 rue du Port, 44000 Nantes', pays: 'FR', siren: '732829320', tva: 'FR44732829320', courriel: 'contact@exemple.fr' };
const commande = (x: Partial<CommandeFacturee>): CommandeFacturee => ({ id: 'c1', vente_facture: { numero: '2026-000001', emise_le: '2026-11-27T08:00:00Z' }, vente_devise: 'EUR',
  vente_nom: 'Ada Lovelace', vente_courriel: 'ada@exemple.fr', vente_adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' }, ...x });

/** Les montants lus du XML, en centimes. */
function lesMontants(xml: string) {
  const c = (s: string) => Math.round(Number(s) * 100);
  const un = (balise: string) => { const r = new RegExp(`<ram:${balise}(?: [^>]*)?>([^<]+)</ram:${balise}>`).exec(xml); return r ? c(r[1]!) : 0; };
  const resume = xml.slice(xml.indexOf('<ram:SpecifiedTradeSettlementHeaderMonetarySummation>'));
  const lignes = [...xml.matchAll(/<ram:IncludedSupplyChainTradeLineItem>([\s\S]*?)<\/ram:IncludedSupplyChainTradeLineItem>/g)].map((m) => ({
    taux: Number(/<ram:RateApplicablePercent>([^<]+)</.exec(m[1]!)![1]), net: c(/<ram:LineTotalAmount>([^<]+)</.exec(m[1]!)![1]!) }));
  const entete = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'));
  const taxes = [...entete.matchAll(/<ram:ApplicableTradeTax>([\s\S]*?)<\/ram:ApplicableTradeTax>/g)].map((m) => ({
    tva: c(/<ram:CalculatedAmount>([^<]+)</.exec(m[1]!)![1]!), base: c(/<ram:BasisAmount>([^<]+)</.exec(m[1]!)![1]!), taux: Number(/<ram:RateApplicablePercent>([^<]+)</.exec(m[1]!)![1]) }));
  const r = (b: string) => { const x = new RegExp(`<ram:${b}(?: [^>]*)?>([^<]+)</ram:${b}>`).exec(resume); return x ? c(x[1]!) : 0; };
  return { lignes, taxes, total: { lignes: r('LineTotalAmount'), base: r('TaxBasisTotalAmount'), tva: r('TaxTotalAmount'), arrondi: r('RoundingAmount'),
    ttc: r('GrandTotalAmount'), paye: r('TotalPrepaidAmount'), du: r('DuePayableAmount') }, un };
}
/** Les règles de calcul de la norme, vérifiées sur le XML rendu. */
function tientLesRegles(xml: string): void {
  const { lignes, taxes, total } = lesMontants(xml);
  expect(total.lignes).toBe(lignes.reduce((s, l) => s + l.net, 0));                              // BR-CO-10
  expect(total.base).toBe(total.lignes);                                                        // BR-CO-13 (ni remise ni frais d'en-tête)
  expect(total.tva).toBe(taxes.reduce((s, t) => s + t.tva, 0));                                 // BR-CO-14
  expect(total.ttc).toBe(total.base + total.tva);                                               // BR-CO-15
  expect(total.du).toBe(total.ttc - total.paye + total.arrondi);                               // BR-CO-16
  for (const t of taxes) {
    expect(t.tva).toBe(Math.round((t.base * t.taux) / 100));                                    // BR-CO-17
    expect(t.base).toBe(lignes.filter((l) => l.taux === t.taux).reduce((s, l) => s + l.net, 0)); // BR-S-08
  }
}

describe('les identifiants', () => {
  it('le SIREN se lit d’un SIREN ou d’un SIRET à clé juste, espaces compris ; le n° de TVA se relit', () => {
    expect(leSiren('732 829 320')).toBe('732829320');
    expect(leSiren('RCS Nantes 732 829 320 00074'.replace(/ (\d{3}) (\d{3}) (\d{3}) (\d{5})$/, ' $1$2$3$4'))).toBe('732829320');
    expect(leSiren('73282932000074')).toBe('732829320');
    expect(leSiren('732829321')).toBeNull();
    expect(laTva('fr 44 732829320')).toBe('FR44732829320');
    expect(laTva('44732829320')).toBeNull();
  });
  it('l’acheteur pro : société, SIREN et TVA facultatifs, relus ; un SIREN faux est refusé en le nommant', () => {
    const l = { pays: ['FR'], fraisCentimes: 0, offerteDesCentimes: null, retrait: null, zones: [] };
    const a = { nom: 'Ada Lovelace', courriel: 'ada@exemple.fr', adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR' } };
    expect(lireLesCoordonnees({ ...a, societe: 'Lovelace SARL', siren: '552 100 554', tva: 'fr12552100554' }, l)).toMatchObject({ adresse: { societe: 'Lovelace SARL', siren: '552100554', tva: 'FR12552100554' } });
    expect(lireLesCoordonnees({ ...a, siren: '123456789' }, l)).toBe('acheteur.siren');
    expect(lireLesCoordonnees({ ...a, tva: '12' }, l)).toBe('acheteur.tva');
  });
});

describe('le XML Factur-X d’une commande payée', () => {
  it('INCIDENT — deux taux et un envoi : le XML tient le schéma officiel et les règles de calcul ; vendeur et acheteur pro identifiés', () => {
    const c = commande({ vente_lignes: [{ libelle: 'Thé & co', centimes: 1250, quantite: 3, taux: 5.5 }, { libelle: 'Théière', centimes: 3999, quantite: 1, taux: 20 }],
      vente_livraison_centimes: 590, vente_montant_centimes: 3750 + 3999 + 590,
      vente_adresse: { line1: '1 rue', postal_code: '75001', city: 'Paris', country: 'FR', societe: 'Lovelace SARL', siren: '552100554', tva: 'FR12552100554' } });
    const r = leXmlFacturX(boutique(true), VENDEUR, c);
    if (r.forme !== 'xml') throw new Error(r.manques.join(', '));
    if (XMLLINT) expect(valide(r.xml)).toBe('valide');
    tientLesRegles(r.xml);
    expect(r.xml).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
    expect(r.xml).toContain('<ram:ID schemeID="VA">FR44732829320</ram:ID>');
    expect(r.xml).toContain('<ram:Name>Lovelace SARL</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">552100554</ram:ID>');
    expect(r.xml).toContain('Thé &amp; co');
    expect(lesMontants(r.xml).total.ttc + lesMontants(r.xml).total.arrondi).toBe(8339);
  });
  it('un prix remisé qui ne tombe pas juste : l’écart d’un centime est dit en arrondi, rien dû', () => {
    const r = leXmlFacturX(boutique(true), VENDEUR, commande({ vente_lignes: [{ libelle: 'Bol', centimes: 1333, quantite: 7, taux: 20 }], vente_montant_centimes: 9331 }));
    if (r.forme !== 'xml') throw new Error(r.manques.join(', '));
    if (XMLLINT) expect(valide(r.xml)).toBe('valide');
    tientLesRegles(r.xml);
    const t = lesMontants(r.xml).total;
    expect([t.paye, t.du, t.ttc + t.arrondi]).toEqual([9331, 0, 9331]);
  });
  it('un vendeur en franchise : catégorie E, la mention de l’art. 293 B, son SIREN pour identifiant', () => {
    const r = leXmlFacturX(boutique(false), { ...VENDEUR, tva: null }, commande({ vente_lignes: [{ libelle: 'Cours', centimes: 4500, quantite: 2, taux: null }], vente_livraison_centimes: 500, vente_montant_centimes: 9500 }));
    if (r.forme !== 'xml') throw new Error(r.manques.join(', '));
    if (XMLLINT) expect(valide(r.xml)).toBe('valide');
    tientLesRegles(r.xml);
    expect(r.xml).toContain('<ram:CategoryCode>E</ram:CategoryCode><ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>');
    expect(r.xml).toContain('<ram:ID schemeID="FC">732829320</ram:ID>');
  });
  it('ce qui manque à la conformité est nommé, rien n’est inventé', () => {
    const r = leXmlFacturX(boutique(true), { ...VENDEUR, tva: null }, commande({ vente_adresse: { telephone: '0102030405' }, vente_lignes: [{ libelle: 'Bol', centimes: 1000, quantite: 1, taux: 20 }] }));
    expect(r).toEqual({ forme: 'manque', manques: ['le n° de TVA intracommunautaire du vendeur', 'l’adresse de l’acheteur (une commande retirée sur place n’en a pas)'] });
  });
});
