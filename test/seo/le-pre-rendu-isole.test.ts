/**
 * Le pré-rendu exécute le code d'une app écrit par Claude dans un vrai navigateur : il garde le bac à sable de Chromium,
 * et la page ne joint que le site servi en mémoire et la base de l'app (vague 0, audit du 24/11). Constructor-v13 lançait
 * Chromium avec `--no-sandbox` et sans clôture : une page pouvait joindre un service interne du serveur.
 *
 * Joué à la main le 24/11 en utilisateur non root, avec une page qui appelle un serveur local, une IP, un hôte externe
 * et un WebSocket : avant, le serveur local reçoit l'appel (1 coup) ; après, aucun ne passe (0 coup).
 */
import { describe, expect, it } from 'vitest';
import { argumentsDuNavigateur, requetePermise } from '@/lib/seo/le-pre-rendu';

describe('le réseau du navigateur du pré-rendu', () => {
  const site = 'http://127.0.0.1:41234/__vavi_base__/';
  const base = ['https://abc.supabase.co'];
  it('la page joint le site servi en mémoire et la base de l’app', () => {
    expect(requetePermise('http://127.0.0.1:41234/__vavi_base__/assets/a.js', site, base)).toBe(true);
    expect(requetePermise('https://abc.supabase.co/rest/v1/x', site, base)).toBe(true);
  });
  it('rien d’autre : un autre port local, une IP, un hôte externe, une adresse illisible', () => {
    expect(requetePermise('http://127.0.0.1:3000/api/mcp', site, base)).toBe(false);
    expect(requetePermise('http://169.254.169.254/latest/meta-data', site, base)).toBe(false);
    expect(requetePermise('https://ailleurs.test/', site, base)).toBe(false);
    expect(requetePermise('https://abc.supabase.co.ailleurs.test/', site, base)).toBe(false);
    expect(requetePermise('pas une adresse', site, base)).toBe(false);
  });
  it('tout le reste passe par un mandataire qui n’existe pas, jamais --no-sandbox', () => {
    const a = argumentsDuNavigateur(base);
    expect(a).toContain('--proxy-server=http://127.0.0.1:9');
    expect(a).toContain('--proxy-bypass-list=abc.supabase.co');
    expect(a.join(' ')).not.toContain('no-sandbox');
  });
});
