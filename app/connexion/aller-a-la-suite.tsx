'use client';
import { useEffect } from 'react';
import { Connexion } from '@/app/_partage/connexion';

function Aller({ suite }: { suite: string }) {
  useEffect(() => { window.location.assign(suite); }, [suite]);
  return null;
}

export function AllerALaSuite({ langue, suite }: { langue: 'fr' | 'en'; suite: string }) {
  return <Connexion langue={langue} connecte={() => <Aller suite={suite} />} />;
}
