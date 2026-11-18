/**
 * Rater-facing text in five languages (Phase 11 polish). Raters choose a language on the form;
 * the default comes from the browser. The subject's invitation message is shown as they wrote it.
 */
export const RATER_LOCALES = ["en", "es", "fr", "de", "pt"] as const;
export type RaterLocale = (typeof RATER_LOCALES)[number];
export const LOCALE_NAMES: Record<RaterLocale, string> = { en: "English", es: "Español", fr: "Français", de: "Deutsch", pt: "Português" };
export const isRaterLocale = (x: unknown): x is RaterLocale => typeof x === "string" && (RATER_LOCALES as readonly string[]).includes(x);

/** ?lang= wins, then the saved choice, then the browser's Accept-Language, then English. */
export function pickLocale(param?: string | null, saved?: string | null, acceptLanguage?: string | null): RaterLocale {
  if (isRaterLocale(param)) return param;
  if (isRaterLocale(saved)) return saved;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isRaterLocale(code)) return code;
  }
  return "en";
}

export type RaterStrings = {
  language: string;
  answeredOf: (a: number, n: number) => string;
  saving: string;
  saved: string;
  saveError: string;
  progress: string;
  start: string;
  resume: string;
  answerAll: (n: number) => string;
  sectionOf: (i: number, n: number) => string;
  howOften: (name: string) => string;
  ratingLabels: Record<number, string>;
  dontKnow: string;
  commentOn: (competency: string) => string;
  openHeading: string;
  openHint: string;
  startQ: (name: string) => string;
  stopQ: (name: string) => string;
  continueQ: (name: string) => string;
  anythingElse: string;
  deidentifyTitle: string;
  deidentifyBody: string;
  previewRewrite: string;
  rewriting: string;
  aiUnavailable: string;
  rewritten: string;
  reviewHeading: string;
  edit: string;
  privacyNote: string;
  back: string;
  next: string;
  submit: string;
  submitting: string;
  thankYou: string;
  submittedBody: (name: string) => string;
  wouldValue: (name: string) => string;
  minutes: (m: number) => string;
  statements: (n: number) => string;
  openUntil: (date: string) => string;
  noDeadline: string;
  autosave: string;
  anonymous: (name: string) => string;
  decline: string;
  declineConfirm: string;
  declined: (name: string) => string;
  slowDownTitle: string;
  slowDownBody: string;
  invalidTitle: string;
  invalidBody: string;
  doneBody: (name: string) => string;
  noProblem: string;
  declinedBody: (name: string) => string;
  closedTitle: string;
  closedBody: (name: string) => string;
  notOpenTitle: string;
  notOpenBody: (name: string) => string;
  translatedNote: string;
};

const en: RaterStrings = {
  language: "Language",
  answeredOf: (a, n) => `${a} of ${n} answered`,
  saving: "Saving…",
  saved: "Progress saved",
  saveError: "Couldn't save — check your connection",
  progress: "Questionnaire progress",
  start: "Start",
  resume: "Continue where I left off",
  answerAll: (n) => `Please answer all ${n} statements (choose “Don't know” if you haven't seen it).`,
  sectionOf: (i, n) => `Section ${i} of ${n}`,
  howOften: (name) => `How often does ${name} do the following?`,
  ratingLabels: { 1: "Rarely", 2: "Sometimes", 3: "Often", 4: "Very often", 5: "Almost always" },
  dontKnow: "Don't know / haven't seen this",
  commentOn: (c) => `Comment on ${c.toLowerCase()} (optional)`,
  openHeading: "In your own words",
  openHint: "Optional, but this is often the most useful part. Avoid details that would identify you.",
  startQ: (n) => `What should ${n} START doing?`,
  stopQ: (n) => `What should ${n} STOP doing?`,
  continueQ: (n) => `What should ${n} CONTINUE doing?`,
  anythingElse: "Anything else you'd like to share?",
  deidentifyTitle: "Remove details that could identify me",
  deidentifyBody: "AI rewrites your comments to remove names, places, dates and other give-aways before they are saved. Your original wording is not kept.",
  previewRewrite: "Preview rewritten comments",
  rewriting: "Rewriting…",
  aiUnavailable: "AI isn't available right now; only emails, phone numbers and links will be removed.",
  rewritten: "Rewritten comments",
  reviewHeading: "Ready to submit?",
  edit: "Edit",
  privacyNote: "Your answers are stored without your name or email and only shown combined with others.",
  back: "Back",
  next: "Next",
  submit: "Submit feedback",
  submitting: "Submitting…",
  thankYou: "Thank you!",
  submittedBody: (n) => `Your feedback has been submitted anonymously. ${n} will only see it combined with others.`,
  wouldValue: (n) => `${n} would value your feedback`,
  minutes: (m) => `About ${m} minutes`,
  statements: (n) => `${n} statements`,
  openUntil: (d) => `open until ${d}`,
  noDeadline: "no deadline",
  autosave: "Your progress saves automatically — come back to this link any time.",
  anonymous: (n) => `Anonymous: ${n} sees how many people answered, never who answered or what any one person said. Results only appear combined with at least two others, and comments are quoted only when at least three people wrote some. Your name and email are never linked to your answers.`,
  decline: "I'd rather not give feedback",
  declineConfirm: "Decline this feedback request?",
  declined: (n) => `You've declined. Thanks for letting ${n} know.`,
  slowDownTitle: "Please slow down",
  slowDownBody: "We've had a lot of requests from your network. Please wait a few minutes and open your link again.",
  invalidTitle: "Link not recognised",
  invalidBody: "This feedback link isn't valid. Please check you copied the whole link from your invitation.",
  doneBody: (n) => `You've already submitted feedback for ${n}. Your answers are anonymous.`,
  noProblem: "No problem",
  declinedBody: (n) => `You've declined this request from ${n}.`,
  closedTitle: "Feedback has closed",
  closedBody: (n) => `${n} is no longer collecting feedback. Thank you anyway!`,
  notOpenTitle: "Not open yet",
  notOpenBody: (n) => `${n} hasn't opened this feedback request yet.`,
  translatedNote: "",
};

const es: RaterStrings = {
  language: "Idioma",
  answeredOf: (a, n) => `${a} de ${n} respondidas`,
  saving: "Guardando…",
  saved: "Progreso guardado",
  saveError: "No se pudo guardar; revisa tu conexión",
  progress: "Progreso del cuestionario",
  start: "Empezar",
  resume: "Continuar donde lo dejé",
  answerAll: (n) => `Responde a las ${n} afirmaciones (elige «No lo sé» si no lo has observado).`,
  sectionOf: (i, n) => `Sección ${i} de ${n}`,
  howOften: (name) => `¿Con qué frecuencia ${name} hace lo siguiente?`,
  ratingLabels: { 1: "Rara vez", 2: "A veces", 3: "A menudo", 4: "Muy a menudo", 5: "Casi siempre" },
  dontKnow: "No lo sé / no lo he observado",
  commentOn: (c) => `Comentario sobre ${c.toLowerCase()} (opcional)`,
  openHeading: "Con tus propias palabras",
  openHint: "Es opcional, pero suele ser la parte más útil. Evita detalles que puedan identificarte.",
  startQ: (n) => `¿Qué debería EMPEZAR a hacer ${n}?`,
  stopQ: (n) => `¿Qué debería DEJAR de hacer ${n}?`,
  continueQ: (n) => `¿Qué debería SEGUIR haciendo ${n}?`,
  anythingElse: "¿Algo más que quieras compartir?",
  deidentifyTitle: "Eliminar los detalles que podrían identificarme",
  deidentifyBody: "La IA reescribe tus comentarios para quitar nombres, lugares, fechas y otras pistas antes de guardarlos. Tu redacción original no se conserva.",
  previewRewrite: "Ver los comentarios reescritos",
  rewriting: "Reescribiendo…",
  aiUnavailable: "La IA no está disponible ahora; solo se eliminarán correos, teléfonos y enlaces.",
  rewritten: "Comentarios reescritos",
  reviewHeading: "¿Listo para enviar?",
  edit: "Editar",
  privacyNote: "Tus respuestas se guardan sin tu nombre ni tu correo y solo se muestran combinadas con las de otras personas.",
  back: "Atrás",
  next: "Siguiente",
  submit: "Enviar opinión",
  submitting: "Enviando…",
  thankYou: "¡Gracias!",
  submittedBody: (n) => `Tu opinión se ha enviado de forma anónima. ${n} solo la verá combinada con las de otras personas.`,
  wouldValue: (n) => `A ${n} le gustaría conocer tu opinión`,
  minutes: (m) => `Unos ${m} minutos`,
  statements: (n) => `${n} afirmaciones`,
  openUntil: (d) => `abierto hasta el ${d}`,
  noDeadline: "sin fecha límite",
  autosave: "Tu progreso se guarda automáticamente: puedes volver a este enlace cuando quieras.",
  anonymous: (n) => `Anónimo: ${n} ve cuántas personas respondieron, nunca quién respondió ni qué dijo cada persona. Los resultados solo aparecen combinados con al menos otras dos personas y los comentarios solo se citan si al menos tres personas escribieron alguno. Tu nombre y tu correo nunca se vinculan a tus respuestas.`,
  decline: "Prefiero no dar mi opinión",
  declineConfirm: "¿Rechazar esta solicitud de opinión?",
  declined: (n) => `Has rechazado la solicitud. Gracias por avisar a ${n}.`,
  slowDownTitle: "Ve más despacio",
  slowDownBody: "Hemos recibido muchas solicitudes desde tu red. Espera unos minutos y vuelve a abrir el enlace.",
  invalidTitle: "Enlace no reconocido",
  invalidBody: "Este enlace no es válido. Comprueba que has copiado el enlace completo de tu invitación.",
  doneBody: (n) => `Ya has enviado tu opinión sobre ${n}. Tus respuestas son anónimas.`,
  noProblem: "No pasa nada",
  declinedBody: (n) => `Has rechazado esta solicitud de ${n}.`,
  closedTitle: "La encuesta se ha cerrado",
  closedBody: (n) => `${n} ya no está recogiendo opiniones. ¡Gracias de todos modos!`,
  notOpenTitle: "Aún no está abierta",
  notOpenBody: (n) => `${n} todavía no ha abierto esta solicitud.`,
  translatedNote: "Algunas afirmaciones personalizadas se han traducido automáticamente.",
};

const fr: RaterStrings = {
  language: "Langue",
  answeredOf: (a, n) => `${a} sur ${n} répondues`,
  saving: "Enregistrement…",
  saved: "Progression enregistrée",
  saveError: "Échec de l'enregistrement — vérifiez votre connexion",
  progress: "Progression du questionnaire",
  start: "Commencer",
  resume: "Reprendre où je m'étais arrêté(e)",
  answerAll: (n) => `Merci de répondre aux ${n} affirmations (choisissez « Je ne sais pas » si vous ne l'avez pas observé).`,
  sectionOf: (i, n) => `Section ${i} sur ${n}`,
  howOften: (name) => `À quelle fréquence ${name} fait-il ou fait-elle ce qui suit ?`,
  ratingLabels: { 1: "Rarement", 2: "Parfois", 3: "Souvent", 4: "Très souvent", 5: "Presque toujours" },
  dontKnow: "Je ne sais pas / je ne l'ai pas observé",
  commentOn: (c) => `Commentaire sur : ${c.toLowerCase()} (facultatif)`,
  openHeading: "Avec vos propres mots",
  openHint: "Facultatif, mais c'est souvent la partie la plus utile. Évitez les détails qui permettraient de vous identifier.",
  startQ: (n) => `Que devrait COMMENCER à faire ${n} ?`,
  stopQ: (n) => `Que devrait ARRÊTER de faire ${n} ?`,
  continueQ: (n) => `Que devrait CONTINUER à faire ${n} ?`,
  anythingElse: "Autre chose à partager ?",
  deidentifyTitle: "Supprimer les détails qui pourraient m'identifier",
  deidentifyBody: "L'IA réécrit vos commentaires pour retirer noms, lieux, dates et autres indices avant leur enregistrement. Votre formulation d'origine n'est pas conservée.",
  previewRewrite: "Aperçu des commentaires réécrits",
  rewriting: "Réécriture…",
  aiUnavailable: "L'IA n'est pas disponible pour le moment ; seuls les e-mails, numéros de téléphone et liens seront retirés.",
  rewritten: "Commentaires réécrits",
  reviewHeading: "Prêt(e) à envoyer ?",
  edit: "Modifier",
  privacyNote: "Vos réponses sont enregistrées sans votre nom ni votre e-mail et ne sont montrées que regroupées avec d'autres.",
  back: "Retour",
  next: "Suivant",
  submit: "Envoyer mon retour",
  submitting: "Envoi…",
  thankYou: "Merci !",
  submittedBody: (n) => `Votre retour a été envoyé de façon anonyme. ${n} ne le verra que regroupé avec ceux des autres.`,
  wouldValue: (n) => `${n} aimerait avoir votre retour`,
  minutes: (m) => `Environ ${m} minutes`,
  statements: (n) => `${n} affirmations`,
  openUntil: (d) => `ouvert jusqu'au ${d}`,
  noDeadline: "pas de date limite",
  autosave: "Votre progression est enregistrée automatiquement : revenez sur ce lien quand vous voulez.",
  anonymous: (n) => `Anonyme : ${n} voit combien de personnes ont répondu, jamais qui a répondu ni ce qu'une personne a dit. Les résultats n'apparaissent que regroupés avec au moins deux autres personnes, et les commentaires ne sont cités que si au moins trois personnes en ont écrit. Votre nom et votre e-mail ne sont jamais liés à vos réponses.`,
  decline: "Je préfère ne pas répondre",
  declineConfirm: "Refuser cette demande de retour ?",
  declined: (n) => `Vous avez refusé. Merci d'avoir prévenu ${n}.`,
  slowDownTitle: "Merci de patienter",
  slowDownBody: "Nous avons reçu beaucoup de demandes depuis votre réseau. Attendez quelques minutes puis rouvrez votre lien.",
  invalidTitle: "Lien non reconnu",
  invalidBody: "Ce lien n'est pas valide. Vérifiez que vous avez copié le lien complet de votre invitation.",
  doneBody: (n) => `Vous avez déjà envoyé votre retour pour ${n}. Vos réponses sont anonymes.`,
  noProblem: "Pas de souci",
  declinedBody: (n) => `Vous avez refusé cette demande de ${n}.`,
  closedTitle: "La collecte est terminée",
  closedBody: (n) => `${n} ne collecte plus de retours. Merci quand même !`,
  notOpenTitle: "Pas encore ouvert",
  notOpenBody: (n) => `${n} n'a pas encore ouvert cette demande.`,
  translatedNote: "Certaines affirmations personnalisées ont été traduites automatiquement.",
};

const de: RaterStrings = {
  language: "Sprache",
  answeredOf: (a, n) => `${a} von ${n} beantwortet`,
  saving: "Wird gespeichert…",
  saved: "Fortschritt gespeichert",
  saveError: "Speichern fehlgeschlagen – bitte Verbindung prüfen",
  progress: "Fortschritt des Fragebogens",
  start: "Los geht's",
  resume: "Dort weitermachen, wo ich aufgehört habe",
  answerAll: (n) => `Bitte beantworten Sie alle ${n} Aussagen (wählen Sie „Weiß nicht“, wenn Sie es nicht beobachtet haben).`,
  sectionOf: (i, n) => `Abschnitt ${i} von ${n}`,
  howOften: (name) => `Wie oft tut ${name} Folgendes?`,
  ratingLabels: { 1: "Selten", 2: "Manchmal", 3: "Oft", 4: "Sehr oft", 5: "Fast immer" },
  dontKnow: "Weiß nicht / nicht beobachtet",
  commentOn: (c) => `Kommentar zu ${c} (optional)`,
  openHeading: "In Ihren eigenen Worten",
  openHint: "Optional, aber oft der hilfreichste Teil. Vermeiden Sie Details, die Sie erkennbar machen.",
  startQ: (n) => `Womit sollte ${n} ANFANGEN?`,
  stopQ: (n) => `Womit sollte ${n} AUFHÖREN?`,
  continueQ: (n) => `Was sollte ${n} WEITERHIN tun?`,
  anythingElse: "Möchten Sie noch etwas teilen?",
  deidentifyTitle: "Details entfernen, die mich erkennbar machen könnten",
  deidentifyBody: "KI formuliert Ihre Kommentare um und entfernt Namen, Orte, Daten und andere Hinweise, bevor sie gespeichert werden. Ihr Originaltext wird nicht aufbewahrt.",
  previewRewrite: "Umformulierte Kommentare ansehen",
  rewriting: "Wird umformuliert…",
  aiUnavailable: "KI ist gerade nicht verfügbar; nur E-Mail-Adressen, Telefonnummern und Links werden entfernt.",
  rewritten: "Umformulierte Kommentare",
  reviewHeading: "Bereit zum Absenden?",
  edit: "Bearbeiten",
  privacyNote: "Ihre Antworten werden ohne Namen und E-Mail-Adresse gespeichert und nur zusammen mit anderen gezeigt.",
  back: "Zurück",
  next: "Weiter",
  submit: "Feedback absenden",
  submitting: "Wird gesendet…",
  thankYou: "Vielen Dank!",
  submittedBody: (n) => `Ihr Feedback wurde anonym übermittelt. ${n} sieht es nur zusammen mit dem Feedback anderer.`,
  wouldValue: (n) => `${n} freut sich über Ihr Feedback`,
  minutes: (m) => `Etwa ${m} Minuten`,
  statements: (n) => `${n} Aussagen`,
  openUntil: (d) => `offen bis ${d}`,
  noDeadline: "keine Frist",
  autosave: "Ihr Fortschritt wird automatisch gespeichert – Sie können jederzeit über diesen Link zurückkehren.",
  anonymous: (n) => `Anonym: ${n} sieht, wie viele Personen geantwortet haben, aber nie wer geantwortet hat oder was eine einzelne Person gesagt hat. Ergebnisse erscheinen nur zusammen mit mindestens zwei weiteren Personen, und Kommentare werden nur zitiert, wenn mindestens drei Personen welche geschrieben haben. Name und E-Mail werden nie mit Ihren Antworten verknüpft.`,
  decline: "Ich möchte lieber kein Feedback geben",
  declineConfirm: "Diese Feedback-Anfrage ablehnen?",
  declined: (n) => `Sie haben abgelehnt. Danke, dass Sie ${n} Bescheid gegeben haben.`,
  slowDownTitle: "Bitte etwas langsamer",
  slowDownBody: "Aus Ihrem Netzwerk kamen sehr viele Anfragen. Bitte warten Sie ein paar Minuten und öffnen Sie den Link erneut.",
  invalidTitle: "Link nicht erkannt",
  invalidBody: "Dieser Feedback-Link ist ungültig. Bitte prüfen Sie, ob Sie den ganzen Link aus der Einladung kopiert haben.",
  doneBody: (n) => `Sie haben bereits Feedback für ${n} abgegeben. Ihre Antworten sind anonym.`,
  noProblem: "Kein Problem",
  declinedBody: (n) => `Sie haben diese Anfrage von ${n} abgelehnt.`,
  closedTitle: "Feedback ist geschlossen",
  closedBody: (n) => `${n} sammelt kein Feedback mehr. Trotzdem vielen Dank!`,
  notOpenTitle: "Noch nicht geöffnet",
  notOpenBody: (n) => `${n} hat diese Anfrage noch nicht geöffnet.`,
  translatedNote: "Einige individuelle Aussagen wurden automatisch übersetzt.",
};

const pt: RaterStrings = {
  language: "Idioma",
  answeredOf: (a, n) => `${a} de ${n} respondidas`,
  saving: "A guardar…",
  saved: "Progresso guardado",
  saveError: "Não foi possível guardar — verifique a ligação",
  progress: "Progresso do questionário",
  start: "Começar",
  resume: "Continuar onde parei",
  answerAll: (n) => `Responda às ${n} afirmações (escolha «Não sei» se não observou).`,
  sectionOf: (i, n) => `Secção ${i} de ${n}`,
  howOften: (name) => `Com que frequência ${name} faz o seguinte?`,
  ratingLabels: { 1: "Raramente", 2: "Às vezes", 3: "Frequentemente", 4: "Muito frequentemente", 5: "Quase sempre" },
  dontKnow: "Não sei / não observei",
  commentOn: (c) => `Comentário sobre ${c.toLowerCase()} (opcional)`,
  openHeading: "Por palavras suas",
  openHint: "Opcional, mas costuma ser a parte mais útil. Evite detalhes que o possam identificar.",
  startQ: (n) => `O que deveria ${n} COMEÇAR a fazer?`,
  stopQ: (n) => `O que deveria ${n} DEIXAR de fazer?`,
  continueQ: (n) => `O que deveria ${n} CONTINUAR a fazer?`,
  anythingElse: "Mais alguma coisa que queira partilhar?",
  deidentifyTitle: "Remover detalhes que me possam identificar",
  deidentifyBody: "A IA reescreve os seus comentários para retirar nomes, locais, datas e outras pistas antes de serem guardados. O texto original não é guardado.",
  previewRewrite: "Pré-visualizar comentários reescritos",
  rewriting: "A reescrever…",
  aiUnavailable: "A IA não está disponível de momento; só serão removidos emails, telefones e links.",
  rewritten: "Comentários reescritos",
  reviewHeading: "Pronto para enviar?",
  edit: "Editar",
  privacyNote: "As suas respostas são guardadas sem o seu nome ou email e só são mostradas em conjunto com as de outras pessoas.",
  back: "Voltar",
  next: "Seguinte",
  submit: "Enviar feedback",
  submitting: "A enviar…",
  thankYou: "Obrigado!",
  submittedBody: (n) => `O seu feedback foi enviado de forma anónima. ${n} só o verá em conjunto com o de outras pessoas.`,
  wouldValue: (n) => `${n} gostaria de receber o seu feedback`,
  minutes: (m) => `Cerca de ${m} minutos`,
  statements: (n) => `${n} afirmações`,
  openUntil: (d) => `aberto até ${d}`,
  noDeadline: "sem prazo",
  autosave: "O seu progresso é guardado automaticamente — pode voltar a este link quando quiser.",
  anonymous: (n) => `Anónimo: ${n} vê quantas pessoas responderam, nunca quem respondeu nem o que cada pessoa disse. Os resultados só aparecem combinados com pelo menos outras duas pessoas e os comentários só são citados se pelo menos três pessoas escreveram algum. O seu nome e email nunca ficam ligados às suas respostas.`,
  decline: "Prefiro não dar feedback",
  declineConfirm: "Recusar este pedido de feedback?",
  declined: (n) => `Recusou. Obrigado por avisar ${n}.`,
  slowDownTitle: "Mais devagar, por favor",
  slowDownBody: "Recebemos muitos pedidos da sua rede. Aguarde alguns minutos e abra o link novamente.",
  invalidTitle: "Link não reconhecido",
  invalidBody: "Este link não é válido. Verifique se copiou o link completo do convite.",
  doneBody: (n) => `Já enviou feedback para ${n}. As suas respostas são anónimas.`,
  noProblem: "Sem problema",
  declinedBody: (n) => `Recusou este pedido de ${n}.`,
  closedTitle: "O feedback está fechado",
  closedBody: (n) => `${n} já não está a recolher feedback. Obrigado na mesma!`,
  notOpenTitle: "Ainda não está aberto",
  notOpenBody: (n) => `${n} ainda não abriu este pedido.`,
  translatedNote: "Algumas afirmações personalizadas foram traduzidas automaticamente.",
};

export const RATER_STRINGS: Record<RaterLocale, RaterStrings> = { en, es, fr, de, pt };
export const raterStrings = (l: RaterLocale) => RATER_STRINGS[l];
