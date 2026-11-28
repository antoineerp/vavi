/** Incident du 28/11 : des visites venues de Facebook, aucun compte. Google refuse la connexion dans le navigateur intégré d'une app. */
import { describe, expect, it } from 'vitest';
import { lAdresseDansLeNavigateur, leNavigateurIntegre } from '@/app/_partage/le-navigateur-integre';

const FB_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.40.97;]';
const FB_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/485.0.0.36.107;FBBV/665800000;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/fr_FR;FBOP/5;FBRV/0]';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.12.235 (iPhone14,5; iOS 17_5; fr_FR; fr; scale=3.00; 1170x2532; 593425478)';
const MESSENGER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0.0.37.110;]';
const LINKEDIN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1234';
const VUE_WEB = 'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const BUREAU = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('le navigateur intégré', () => {
  it('reconnaît les navigateurs des apps, et le nom de l’app', () => {
    expect(leNavigateurIntegre(FB_ANDROID)).toEqual({ app: 'Facebook', android: true });
    expect(leNavigateurIntegre(FB_IOS)).toEqual({ app: 'Facebook', android: false });
    expect(leNavigateurIntegre(INSTAGRAM)?.app).toBe('Instagram');
    expect(leNavigateurIntegre(MESSENGER)?.app).toBe('Messenger');
    expect(leNavigateurIntegre(LINKEDIN)?.app).toBe('LinkedIn');
    expect(leNavigateurIntegre(VUE_WEB)).toEqual({ app: null, android: true });
  });
  it('laisse les vrais navigateurs tranquilles (Google y reste proposé)', () => {
    for (const ua of [CHROME_ANDROID, SAFARI_IOS, BUREAU]) expect(leNavigateurIntegre(ua)).toBeNull();
  });
  it('sur Android, rouvre la même page dans le navigateur du téléphone ; sur iPhone, aucune adresse sûre', () => {
    const a = lAdresseDansLeNavigateur('https://www.vavi.dev/connexion?suite=/abonnement', leNavigateurIntegre(FB_ANDROID)!);
    expect(a).toBe('intent://www.vavi.dev/connexion?suite=/abonnement#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=https%3A%2F%2Fwww.vavi.dev%2Fconnexion%3Fsuite%3D%2Fabonnement;end');
    expect(lAdresseDansLeNavigateur('https://www.vavi.dev/connexion', leNavigateurIntegre(FB_IOS)!)).toBeNull();
    expect(lAdresseDansLeNavigateur('javascript:alert(1)', leNavigateurIntegre(FB_ANDROID)!)).toBeNull();
  });
});
