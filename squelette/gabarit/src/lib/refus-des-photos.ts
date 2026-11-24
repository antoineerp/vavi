/**
 * Ce que disent les photos et le film quand le navigateur ne peut pas : une raison et le geste qui la lève, dans la
 * langue de l'app, au vouvoiement. `{nom}`, `{n}`, `{max}`, `{detail}` : ce que l'appel remplit.
 */
import { langueCourante } from './langue';
import type { Resultat } from './resultat';

type Refus = readonly [raison: string, geste: string];

const FR = {
  navigateurSeul: ['Le choix des photos ne s’ouvre que dans un navigateur.', 'Ouvrez l’app dans un navigateur.'],
  imageIllisible: ['« {nom} » n’a pas pu être ouverte par ce navigateur (format non pris en charge, souvent une photo HEIC).', 'Choisissez la photo au format JPEG, ou ouvrez l’app dans Safari.'],
  dessinImpossible: ['Ce navigateur ne sait pas dessiner une image.', 'Ouvrez l’app dans un navigateur récent.'],
  reductionImpossible: ['« {nom} » n’a pas pu être réduite.', 'Réessayez avec une autre photo.'],
  videoImpossible: ['Ce navigateur ne sait pas enregistrer une vidéo.', 'Ouvrez l’app dans un navigateur récent (Chrome, Edge, Firefox ou Safari).'],
  aucunePhoto: ['Aucune photo à monter.', 'Choisissez au moins une photo.'],
  tropDePhotos: ['{n} photos : un film en monte au plus {max}.', 'Choisissez une période plus courte, ou faites plusieurs films.'],
  montageArrete: ['Le montage a été arrêté.', 'Relancez-le quand vous voulez.'],
  aucuneOuverte: ['Aucune des photos n’a pu être ouverte par ce navigateur.', 'Choisissez des photos JPEG ou PNG.'],
  videoVide: ['La vidéo est vide : l’enregistrement n’a rien reçu.', 'Gardez l’onglet ouvert pendant le montage, puis relancez-le.'],
  partageImpossible: ['Ce navigateur ne sait pas partager une vidéo.', 'Enregistrez-la sur l’appareil, puis partagez le fichier.'],
  partageAnnule: ['Le partage a été annulé.', 'Partagez-la quand vous voulez.'],
  partageEchoue: ['Le partage a échoué ({detail}).', 'Enregistrez-la sur l’appareil, puis partagez le fichier.'],
} satisfies Record<string, Refus>;

export type RefusDesPhotos = keyof typeof FR;
type Table = Readonly<Record<RefusDesPhotos, Refus>>;

const PAR_LANGUE: Readonly<Record<string, Table>> = {
  fr: FR,
  en: {
    navigateurSeul: ['Photos can only be chosen in a browser.', 'Open the app in a browser.'],
    imageIllisible: ['“{nom}” could not be opened by this browser (unsupported format, often a HEIC photo).', 'Choose the photo as a JPEG, or open the app in Safari.'],
    dessinImpossible: ['This browser cannot draw an image.', 'Open the app in a recent browser.'],
    reductionImpossible: ['“{nom}” could not be resized.', 'Try again with another photo.'],
    videoImpossible: ['This browser cannot record a video.', 'Open the app in a recent browser (Chrome, Edge, Firefox or Safari).'],
    aucunePhoto: ['No photo to put in the film.', 'Choose at least one photo.'],
    tropDePhotos: ['{n} photos: a film takes {max} at most.', 'Choose a shorter period, or make several films.'],
    montageArrete: ['The film was stopped.', 'Start it again whenever you like.'],
    aucuneOuverte: ['None of the photos could be opened by this browser.', 'Choose JPEG or PNG photos.'],
    videoVide: ['The video is empty: the recording received nothing.', 'Keep the tab open while the film is made, then start it again.'],
    partageImpossible: ['This browser cannot share a video.', 'Save it on the device, then share the file.'],
    partageAnnule: ['Sharing was cancelled.', 'Share it whenever you like.'],
    partageEchoue: ['Sharing failed ({detail}).', 'Save it on the device, then share the file.'],
  },
  de: {
    navigateurSeul: ['Fotos lassen sich nur in einem Browser auswählen.', 'Öffnen Sie die App in einem Browser.'],
    imageIllisible: ['„{nom}“ konnte von diesem Browser nicht geöffnet werden (Format nicht unterstützt, oft ein HEIC-Foto).', 'Wählen Sie das Foto als JPEG, oder öffnen Sie die App in Safari.'],
    dessinImpossible: ['Dieser Browser kann kein Bild zeichnen.', 'Öffnen Sie die App in einem aktuellen Browser.'],
    reductionImpossible: ['„{nom}“ konnte nicht verkleinert werden.', 'Versuchen Sie es mit einem anderen Foto.'],
    videoImpossible: ['Dieser Browser kann kein Video aufnehmen.', 'Öffnen Sie die App in einem aktuellen Browser (Chrome, Edge, Firefox oder Safari).'],
    aucunePhoto: ['Kein Foto für den Film.', 'Wählen Sie mindestens ein Foto.'],
    tropDePhotos: ['{n} Fotos: Ein Film nimmt höchstens {max} auf.', 'Wählen Sie einen kürzeren Zeitraum, oder machen Sie mehrere Filme.'],
    montageArrete: ['Der Film wurde angehalten.', 'Starten Sie ihn erneut, wann Sie möchten.'],
    aucuneOuverte: ['Keines der Fotos konnte von diesem Browser geöffnet werden.', 'Wählen Sie JPEG- oder PNG-Fotos.'],
    videoVide: ['Das Video ist leer: Die Aufnahme hat nichts erhalten.', 'Lassen Sie den Tab während der Erstellung geöffnet und starten Sie erneut.'],
    partageImpossible: ['Dieser Browser kann kein Video teilen.', 'Speichern Sie es auf dem Gerät und teilen Sie dann die Datei.'],
    partageAnnule: ['Das Teilen wurde abgebrochen.', 'Teilen Sie es, wann Sie möchten.'],
    partageEchoue: ['Das Teilen ist fehlgeschlagen ({detail}).', 'Speichern Sie es auf dem Gerät und teilen Sie dann die Datei.'],
  },
  es: {
    navigateurSeul: ['Las fotos solo se eligen en un navegador.', 'Abra la app en un navegador.'],
    imageIllisible: ['Este navegador no pudo abrir «{nom}» (formato no compatible, a menudo una foto HEIC).', 'Elija la foto en formato JPEG, o abra la app en Safari.'],
    dessinImpossible: ['Este navegador no sabe dibujar una imagen.', 'Abra la app en un navegador reciente.'],
    reductionImpossible: ['No se pudo reducir «{nom}».', 'Inténtelo con otra foto.'],
    videoImpossible: ['Este navegador no sabe grabar un vídeo.', 'Abra la app en un navegador reciente (Chrome, Edge, Firefox o Safari).'],
    aucunePhoto: ['No hay ninguna foto para el vídeo.', 'Elija al menos una foto.'],
    tropDePhotos: ['{n} fotos: un vídeo admite {max} como máximo.', 'Elija un periodo más corto, o haga varios vídeos.'],
    montageArrete: ['El montaje se ha detenido.', 'Vuelva a lanzarlo cuando quiera.'],
    aucuneOuverte: ['Este navegador no pudo abrir ninguna de las fotos.', 'Elija fotos JPEG o PNG.'],
    videoVide: ['El vídeo está vacío: la grabación no recibió nada.', 'Mantenga la pestaña abierta durante el montaje y vuelva a lanzarlo.'],
    partageImpossible: ['Este navegador no sabe compartir un vídeo.', 'Guárdelo en el dispositivo y comparta el archivo.'],
    partageAnnule: ['Se ha cancelado el envío.', 'Compártalo cuando quiera.'],
    partageEchoue: ['No se pudo compartir ({detail}).', 'Guárdelo en el dispositivo y comparta el archivo.'],
  },
  it: {
    navigateurSeul: ['Le foto si scelgono solo in un browser.', 'Apra l’app in un browser.'],
    imageIllisible: ['Questo browser non è riuscito ad aprire «{nom}» (formato non supportato, spesso una foto HEIC).', 'Scelga la foto in formato JPEG, oppure apra l’app in Safari.'],
    dessinImpossible: ['Questo browser non sa disegnare un’immagine.', 'Apra l’app in un browser recente.'],
    reductionImpossible: ['Non è stato possibile ridurre «{nom}».', 'Riprovi con un’altra foto.'],
    videoImpossible: ['Questo browser non sa registrare un video.', 'Apra l’app in un browser recente (Chrome, Edge, Firefox o Safari).'],
    aucunePhoto: ['Nessuna foto per il video.', 'Scelga almeno una foto.'],
    tropDePhotos: ['{n} foto: un video ne contiene al massimo {max}.', 'Scelga un periodo più breve, oppure faccia più video.'],
    montageArrete: ['Il montaggio è stato interrotto.', 'Lo rilanci quando vuole.'],
    aucuneOuverte: ['Questo browser non è riuscito ad aprire nessuna delle foto.', 'Scelga foto JPEG o PNG.'],
    videoVide: ['Il video è vuoto: la registrazione non ha ricevuto nulla.', 'Tenga aperta la scheda durante il montaggio, poi lo rilanci.'],
    partageImpossible: ['Questo browser non sa condividere un video.', 'Lo salvi sul dispositivo, poi condivida il file.'],
    partageAnnule: ['La condivisione è stata annullata.', 'Lo condivida quando vuole.'],
    partageEchoue: ['La condivisione non è riuscita ({detail}).', 'Lo salvi sul dispositivo, poi condivida il file.'],
  },
  nl: {
    navigateurSeul: ['Foto’s kiest u alleen in een browser.', 'Open de app in een browser.'],
    imageIllisible: ['“{nom}” kon niet worden geopend door deze browser (niet-ondersteund formaat, vaak een HEIC-foto).', 'Kies de foto als JPEG, of open de app in Safari.'],
    dessinImpossible: ['Deze browser kan geen afbeelding tekenen.', 'Open de app in een recente browser.'],
    reductionImpossible: ['“{nom}” kon niet worden verkleind.', 'Probeer het opnieuw met een andere foto.'],
    videoImpossible: ['Deze browser kan geen video opnemen.', 'Open de app in een recente browser (Chrome, Edge, Firefox of Safari).'],
    aucunePhoto: ['Geen foto voor de film.', 'Kies ten minste één foto.'],
    tropDePhotos: ['{n} foto’s: een film bevat er hoogstens {max}.', 'Kies een kortere periode, of maak meerdere films.'],
    montageArrete: ['De montage is gestopt.', 'Start hem opnieuw wanneer u wilt.'],
    aucuneOuverte: ['Geen van de foto’s kon door deze browser worden geopend.', 'Kies JPEG- of PNG-foto’s.'],
    videoVide: ['De video is leeg: de opname heeft niets ontvangen.', 'Houd het tabblad open tijdens de montage en start hem opnieuw.'],
    partageImpossible: ['Deze browser kan geen video delen.', 'Sla hem op het apparaat op en deel daarna het bestand.'],
    partageAnnule: ['Het delen is geannuleerd.', 'Deel hem wanneer u wilt.'],
    partageEchoue: ['Het delen is mislukt ({detail}).', 'Sla hem op het apparaat op en deel daarna het bestand.'],
  },
  pt: {
    navigateurSeul: ['As fotos só se escolhem num navegador.', 'Abra a app num navegador.'],
    imageIllisible: ['Este navegador não conseguiu abrir «{nom}» (formato não suportado, muitas vezes uma foto HEIC).', 'Escolha a foto em formato JPEG, ou abra a app no Safari.'],
    dessinImpossible: ['Este navegador não sabe desenhar uma imagem.', 'Abra a app num navegador recente.'],
    reductionImpossible: ['Não foi possível reduzir «{nom}».', 'Tente de novo com outra foto.'],
    videoImpossible: ['Este navegador não sabe gravar um vídeo.', 'Abra a app num navegador recente (Chrome, Edge, Firefox ou Safari).'],
    aucunePhoto: ['Nenhuma foto para o filme.', 'Escolha pelo menos uma foto.'],
    tropDePhotos: ['{n} fotos: um filme leva no máximo {max}.', 'Escolha um período mais curto, ou faça vários filmes.'],
    montageArrete: ['A montagem foi interrompida.', 'Volte a iniciá-la quando quiser.'],
    aucuneOuverte: ['Este navegador não conseguiu abrir nenhuma das fotos.', 'Escolha fotos JPEG ou PNG.'],
    videoVide: ['O vídeo está vazio: a gravação não recebeu nada.', 'Mantenha o separador aberto durante a montagem e volte a iniciá-la.'],
    partageImpossible: ['Este navegador não sabe partilhar um vídeo.', 'Guarde-o no dispositivo e depois partilhe o ficheiro.'],
    partageAnnule: ['A partilha foi cancelada.', 'Partilhe-o quando quiser.'],
    partageEchoue: ['A partilha falhou ({detail}).', 'Guarde-o no dispositivo e depois partilhe o ficheiro.'],
  },
};

/** Le refus dit dans la langue de l'app, ses `{…}` remplis. */
export function refusDesPhotos(cle: RefusDesPhotos, valeurs: Readonly<Record<string, string | number>> = {}): Resultat<never> {
  const [raison, geste] = (PAR_LANGUE[langueCourante()] ?? FR)[cle];
  const remplir = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(valeurs[k] ?? ''));
  return { forme: 'refus', raison: remplir(raison), geste: remplir(geste) };
}
