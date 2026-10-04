/**
 * ────────────────────────────────────────────────────────────────────────────
 *  BIRTHDAY CONFIG — the only file you need to edit for names, texts,
 *  the password, the site URL and the music.
 *
 *  Anything written like [THIS] is a placeholder waiting for your words.
 *  Gifts / memories / photos live in `src/data/gifts.ts`.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const birthdayConfig = {
  /** Her name (or the nickname you call her). */
  recipientName: '[RECIPIENT_NAME]',

  /** Your name — used to sign the letter and the final message. */
  senderName: '[SENDER_NAME]',

  /**
   * The playful password: her birthday.
   * Write it as DD/MM/YYYY. She can then type any of:
   *   DDMMYYYY · DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY · D/M/YYYY · DDMMYY
   *
   * ⚠️ This is only a sweet little gate, NOT real security: anyone who reads
   * the site's JavaScript can find it. Don't protect secrets with it.
   */
  birthdayPassword: '01/01/2000', // [BIRTHDAY_PASSWORD]

  /**
   * The public URL where the site will live. The QR code (open /qr.html)
   * is generated from this value — it is the only place the URL is written.
   */
  siteUrl: 'https://tnhi2111.github.io/Mong-chi-choi-vui/',

  /** The day your story began (YYYY-MM-DD). Used to count the days together. Set to '' to hide. */
  togetherSince: '2020-01-01', // [TOGETHER_SINCE]

  /*
   * Texts below may use {name} and {sender} — they are replaced with the two
   * names above, so you only ever type the names once.
   */

  /** Page title shown in the browser tab. */
  pageTitle: 'For you',

  intro: {
    teaser: 'Something special is waiting for you…',
    hint: 'Touch it. Gently.',
    afterUnlock: 'Before you go any further…',
  },

  gate: {
    title: 'Only someone special can enter.',
    subtitle: 'The day the world got a little brighter.',
    inputLabel: 'Your birthday',
    inputPlaceholder: 'DD / MM / YYYY',
    button: 'Open',
    wrong: [
      'Not quite… try again ❤️',
      'Hmm, close your eyes and remember ❤️',
      'Hint: it’s your special day — DD/MM/YYYY',
    ],
  },

  welcome: {
    lines: [
      'Hi, {name}.',
      'I made this little place just for you.',
      'Every light in here holds a piece of us.',
      'Take your time. Open them one by one.',
    ],
    button: 'Step inside',
  },

  room: {
    title: 'A little room for two',
    hint: 'Touch a light to open a memory',
    allOpenedHint: 'Every memory is open… something is waiting in the middle.',
    finalButton: 'Come closer',
    /**
     * A little letter hidden beside the birthday-cake table — only found by turning the room
     * round. [ROOM_SECRET] Write something only she would understand.
     */
    secret: {
      title: 'Em tìm thấy rồi ♥',
      text: '[ROOM_SECRET] Anh biết thế nào em cũng tò mò ngó quanh bàn bánh kem mà.',
    },
    /**
     * Hidden moments: nothing announces them — touching the cake or the HAPPY BIRTHDAY sign
     * brings the camera close and the room "speaks". One string per line.
     */
    moments: {
      /** her age (the rose-gold wire topper on the cake is bent for 2 and 6) */
      age: 26,
      cake: ['26 years of you.', 'And somehow, the world feels a little warmer.'],
      sign: ['Happy birthday, my baby.', 'This little room is only a tiny piece', 'of everything I wanted to give you.'],
    },
    /** The words of the HAPPY BIRTHDAY installation (one family, one composition). */
    sign: {
      headline: ['HAPPY', 'BIRTHDAY'],
      endearment: 'MY BABY',
      name: 'TEACHER HÙ TÁ',
    },
  },

  letter: {
    greeting: 'Gửi {name},',
    /** One string per paragraph. [LOVE_LETTER] */
    paragraphs: [
      'Anh có rất nhiều điều muốn nói, nhưng mỗi lần định nói thì lại chẳng biết bắt đầu từ đâu.',
      '[LOVE_LETTER — đoạn 1] Viết ở đây điều anh nhớ nhất về những ngày đầu tiên.',
      '[LOVE_LETTER — đoạn 2] Viết ở đây điều anh biết ơn nhất ở em.',
      '[LOVE_LETTER — đoạn 3] Viết ở đây điều anh mong cho những năm tiếp theo của hai đứa.',
    ],
    closing: 'Yêu em, hôm nay và cả những ngày sau nữa.',
    signature: '{sender}',
  },

  final: {
    title: 'Happy Birthday, My Love',
    message:
      '[FINAL_MESSAGE] Cảm ơn em đã đến, đã ở lại, và đã làm cho mọi ngày bình thường trở nên đáng nhớ.',
    oneMoreThing: 'One more thing…',
    /** Revealed after “One more thing…” — the emotional climax. */
    secretMessage: [
      '[FINAL_SECRET_MESSAGE]',
      'Tất cả những gì em vừa đi qua chỉ là một phần rất nhỏ.',
      'Phần đẹp nhất vẫn chưa được viết — và anh muốn viết nó cùng em.',
    ],
    signature: '— {sender}',
  },

  music: {
    /**
     * Drop an mp3 into /public/audio/ and put its name here.
     * If the file is missing the music button quietly hides itself.
     */
    src: 'audio/our-song.mp3',
    volume: 0.45,
    label: 'Turn on music',
  },

  heart: {
    /**
     * 'particles' — a heart made of thousands of points of light, with light
     *               dripping into a slowly turning ring of words beneath it.
     * 'glass'     — a glossy, lacquered solid heart.
     */
    style: 'particles' as 'particles' | 'glass',
    /** Words that float around the ring under the heart ({name} / {sender} work here too). */
    words: ['Happy Birthday', '{name}', 'I love you', 'Always', 'Forever', 'Thương em', 'Mãi bên nhau', '♥'],
  },

  motion: {
    /**
     * false (default): the gift moves the same on every device, even if the computer
     * has "reduce motion" / "animation effects off" switched on.
     * true: calmer, shorter animations on such devices (no run, faster gathering…).
     */
    respectReducedMotion: false,
  },

  sound: {
    /**
     * Tiny synthesized effects: a glassy "tink" when hovering a gift or the heart,
     * chimes on taps, a soft thump under the heartbeat. They start only after her
     * first touch (browsers forbid sound before that) and are always very quiet.
     * Set to false to keep the site silent unless she turns the music on.
     */
    effects: true,
    /** 0..1 master volume for those effects. */
    volume: 0.8,
  },
} as const;

export type BirthdayConfig = typeof birthdayConfig;
