// Rotating "chat-style" ticker copy.
// Vibe: feels like a friendly stream chat — supporters cheering you on,
// gaming culture chatter, and the occasional Genki product mention.
// Order is randomized on each visit, then rotates sequentially through.
// Each message types out character-by-character (typewriter), then dwells
// for a few seconds before fading to the next.
//
// Localization: English is the source of truth. Each item may carry
// per-locale overrides under `translations`. Missing translations fall
// back to English at render time, so we can add locales incrementally
// without breaking the ticker. URLs are shared across locales — same
// product page / source, whichever language the visitor is reading.
//
// Cultural adaptation: literal translation of meme-y English rarely
// lands. Where a phrase relies on English pop-culture ("cargo shorts",
// "printer meme"), the translated version prefers a locally-legible
// equivalent tone over a word-for-word rendering.

import type { LanguageCode } from './i18n';

interface LocalizedFields {
  text: string;
  headline?: { label: string };
  link?: { label: string };
}

export interface NewsItem {
  id: string;
  text: string;
  /** Chat-style attribution shown in front of the message ("@HandleName · ").
   * If `href` is set, the handle becomes a clickable link to the source. */
  headline?: { label: string; href?: string };
  /** Optional CTA link rendered after the typed text */
  link?: { href: string; label: string };
  /** Per-language overrides. Missing entries fall back to the English
   * strings above. `href` values (headline.href, link.href) are shared
   * across locales — same source URL either way. */
  translations?: Partial<Record<Exclude<LanguageCode, 'en'>, LocalizedFields>>;
}

export const NEWS_ITEMS: NewsItem[] = [
  // ── Genki product (3) ────────────────────────────────────────────────
  {
    id: 'welcome',
    headline: { label: 'Welcome to Genki Arcade' },
    text: 'fresh browser build, optimized for ShadowCast 3, plays nice with most other capture cards too.',
    translations: {
      ja: {
        headline: { label: 'Genki Arcade へようこそ' },
        text: '最新のブラウザビルド。ShadowCast 3 に最適化、他のキャプチャーカードもだいたい動きます。',
      },
      'zh-CN': {
        headline: { label: '欢迎来到 Genki Arcade' },
        text: '全新的浏览器版本,为 ShadowCast 3 优化,兼容大多数其他采集卡。',
      },
      'zh-TW': {
        headline: { label: '歡迎來到 Genki Arcade' },
        text: '全新的瀏覽器版本,為 ShadowCast 3 最佳化,相容大多數其他擷取卡。',
      },
      ko: {
        headline: { label: 'Genki Arcade에 오신 것을 환영합니다' },
        text: '최신 브라우저 빌드. ShadowCast 3에 최적화, 대부분의 다른 캡처 카드와도 잘 어울립니다.',
      },
      es: {
        headline: { label: 'Bienvenido a Genki Arcade' },
        text: 'build de navegador recién sacada, optimizada para ShadowCast 3 y compatible con casi cualquier otra tarjeta de captura.',
      },
      fr: {
        headline: { label: 'Bienvenue sur Genki Arcade' },
        text: "nouvelle build navigateur, optimisée pour la ShadowCast 3 et compatible avec la plupart des autres cartes d'acquisition.",
      },
      de: {
        headline: { label: 'Willkommen bei Genki Arcade' },
        text: 'frischer Browser-Build, optimiert für die ShadowCast 3, versteht sich mit den meisten anderen Capture Cards.',
      },
    },
  },
  {
    id: 'covert-dock-3',
    headline: {
      label: 'Covert Dock 3 sold out',
      href: 'https://www.genkithings.com/products/covert-dock-3?utm_source=arcade&utm_medium=ticker&utm_campaign=arcade-app',
    },
    text: 'in 2 weeks 🫠 next batch shipping soon. backorder now to skip the line.',
    link: {
      href: 'https://www.genkithings.com/products/covert-dock-3?utm_source=arcade&utm_medium=ticker&utm_campaign=arcade-app',
      label: 'Backorder yours',
    },
    translations: {
      ja: {
        headline: { label: 'Covert Dock 3 · 完売' },
        text: 'たった2週間で 🫠 次の入荷は近日中。列を飛ばすなら今バックオーダーを。',
        link: { label: 'バックオーダーはこちら' },
      },
      'zh-CN': {
        headline: { label: 'Covert Dock 3 · 售罄' },
        text: '两周就没了 🫠 下一批很快出货。想插队现在预订。',
        link: { label: '立即预订' },
      },
      'zh-TW': {
        headline: { label: 'Covert Dock 3 · 售罄' },
        text: '兩週就沒了 🫠 下一批很快出貨。想插隊現在預訂。',
        link: { label: '立即預訂' },
      },
      ko: {
        headline: { label: 'Covert Dock 3 · 품절' },
        text: '단 2주 만에 🫠 다음 배송이 곧 출발. 줄 서기 싫으면 지금 백오더.',
        link: { label: '백오더 예약' },
      },
      es: {
        headline: { label: 'Covert Dock 3 agotado' },
        text: 'en 2 semanas 🫠 la próxima tanda sale pronto. reserva ahora y sáltate la cola.',
        link: { label: 'Reserva la tuya' },
      },
      fr: {
        headline: { label: 'Covert Dock 3 en rupture' },
        text: 'en 2 semaines 🫠 la prochaine vague arrive vite. précommande maintenant pour éviter la file.',
        link: { label: 'Précommander' },
      },
      de: {
        headline: { label: 'Covert Dock 3 ausverkauft' },
        text: 'in 2 Wochen 🫠 die nächste Charge kommt bald. jetzt vorbestellen und die Warteschlange überspringen.',
        link: { label: 'Jetzt vorbestellen' },
      },
    },
  },
  {
    id: 'genki-grips',
    headline: {
      label: 'Genki Grips · new colorways',
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips?utm_source=arcade&utm_medium=ticker&utm_campaign=arcade-app',
    },
    text: 'late pledges are live on Kickstarter — get in before shipping.',
    link: {
      href: 'https://www.kickstarter.com/projects/humanthings/genkigrips?utm_source=arcade&utm_medium=ticker&utm_campaign=arcade-app',
      label: 'Pledge on Kickstarter',
    },
    translations: {
      ja: {
        headline: { label: 'Genki Grips · 新カラー登場' },
        text: 'レイトプレッジは Kickstarter で受付中。出荷前に間に合わせて。',
        link: { label: 'Kickstarter で支援する' },
      },
      'zh-CN': {
        headline: { label: 'Genki Grips · 新配色' },
        text: 'Kickstarter 迟到支持者通道现已开放,在发货前抓紧上车。',
        link: { label: '前往 Kickstarter 支持' },
      },
      'zh-TW': {
        headline: { label: 'Genki Grips · 新配色' },
        text: 'Kickstarter 遲到支持者通道現已開放,在出貨前抓緊上車。',
        link: { label: '前往 Kickstarter 支持' },
      },
      ko: {
        headline: { label: 'Genki Grips · 새로운 컬러웨이' },
        text: 'Kickstarter 레이트 플레지 진행 중 — 배송 전에 올라타자.',
        link: { label: 'Kickstarter에서 후원' },
      },
      es: {
        headline: { label: 'Genki Grips · nuevos colores' },
        text: 'los late pledges están abiertos en Kickstarter — súbete antes del envío.',
        link: { label: 'Apoya en Kickstarter' },
      },
      fr: {
        headline: { label: 'Genki Grips · nouveaux coloris' },
        text: "les late pledges sont ouverts sur Kickstarter — monte à bord avant l'expédition.",
        link: { label: 'Soutenir sur Kickstarter' },
      },
      de: {
        headline: { label: 'Genki Grips · neue Farbvarianten' },
        text: 'Late Pledges sind auf Kickstarter offen — schnell noch mit einsteigen, bevor versandt wird.',
        link: { label: 'Auf Kickstarter unterstützen' },
      },
    },
  },

  // ── Switch 2 / Nintendo (5) ──────────────────────────────────────────
  {
    id: 'yoshi-launched',
    headline: { label: 'Yoshi & the Mysterious Book · just launched' },
    text: "another Switch 2 exclusive in the bag. Nintendo's release calendar is just a printer at this point 📚",
    translations: {
      ja: {
        headline: { label: 'ヨッシーと不思議な本 · 発売中' },
        text: 'またも Switch 2 独占。任天堂のリリースカレンダーはもう完全にプリンター状態 📚',
      },
      'zh-CN': {
        headline: { label: '耀西与神秘之书 · 已发售' },
        text: '又一款 Switch 2 独占入袋。任天堂的发售日历现在就是台印钞机 📚',
      },
      'zh-TW': {
        headline: { label: '耀西與神秘之書 · 已發售' },
        text: '又一款 Switch 2 獨佔入袋。任天堂的發售日曆現在就是台印鈔機 📚',
      },
      ko: {
        headline: { label: '요시와 신비한 책 · 발매' },
        text: '또 하나의 Switch 2 독점 확보. 닌텐도 발매 캘린더는 이제 그냥 인쇄기 📚',
      },
      es: {
        headline: { label: 'Yoshi y el libro misterioso · ya está fuera' },
        text: 'otro exclusivo de Switch 2 en el saco. el calendario de lanzamientos de Nintendo es literalmente una impresora 📚',
      },
      fr: {
        headline: { label: 'Yoshi et le livre mystérieux · sorti' },
        text: 'encore une exclu Switch 2 dans la boîte. le calendrier de sorties de Nintendo est devenu une imprimante 📚',
      },
      de: {
        headline: { label: 'Yoshi & das geheimnisvolle Buch · jetzt erhältlich' },
        text: 'noch eine Switch-2-Exklusive im Sack. Nintendos Release-Kalender ist inzwischen ein Drucker 📚',
      },
    },
  },
  {
    id: 'starfox-out-now',
    headline: { label: 'Star Fox · out now' },
    text: "the 'cinematic remake' of 64 dropped on Switch 2. Andross had 28 years to think about what he did 🦊",
    translations: {
      ja: {
        headline: { label: 'スターフォックス · 発売中' },
        text: '64 の「シネマティック・リメイク」が Switch 2 に降臨。アンドルフには 28 年間、自分のやったことを反省する時間があった 🦊',
      },
      'zh-CN': {
        headline: { label: '星际火狐 · 现已发售' },
        text: '64 的“电影化重制版”登陆 Switch 2。安卓罗斯有 28 年时间反思自己干了啥 🦊',
      },
      'zh-TW': {
        headline: { label: '星戰火狐 · 現已發售' },
        text: '64 的「電影化重製版」登陸 Switch 2。安卓羅斯有 28 年時間反省自己幹了啥 🦊',
      },
      ko: {
        headline: { label: '스타폭스 · 발매' },
        text: '64의 "시네마틱 리메이크"가 Switch 2에 강림. 안드로스는 28년 동안 자기가 뭘 저질렀는지 생각할 시간이 있었다 🦊',
      },
      es: {
        headline: { label: 'Star Fox · ya disponible' },
        text: 'el "remake cinemático" del 64 llegó a Switch 2. Andross tuvo 28 años para pensar en lo que hizo 🦊',
      },
      fr: {
        headline: { label: 'Star Fox · disponible' },
        text: "le « remake cinématique » du 64 débarque sur Switch 2. Andross a eu 28 ans pour repenser à ce qu'il a fait 🦊",
      },
      de: {
        headline: { label: 'Star Fox · jetzt draußen' },
        text: 'das „cinematic Remake" von 64 ist auf Switch 2 gelandet. Andross hatte 28 Jahre, um über seine Taten nachzudenken 🦊',
      },
    },
  },
  {
    id: 'pokopia-4m',
    headline: { label: 'Pokémon Pokopia crosses 4M units' },
    text: 'Game Freak accidentally invented the Stardew killer and they did it in cargo shorts.',
    translations: {
      ja: {
        headline: { label: 'ポケポコピア · 400万本突破' },
        text: 'ゲームフリークがうっかりスターデュー・キラーを生み出した件。しかも普段着のまま。',
      },
      'zh-CN': {
        headline: { label: 'Pokémon Pokopia 突破 400 万销量' },
        text: 'Game Freak 一不留神做出了 Stardew Killer,而且是穿着 T 恤短裤搞出来的。',
      },
      'zh-TW': {
        headline: { label: 'Pokémon Pokopia 突破 400 萬銷量' },
        text: 'Game Freak 一不留神做出了 Stardew Killer,而且是穿著 T 恤短褲搞出來的。',
      },
      ko: {
        headline: { label: '포켓몬 포코피아 · 400만 장 돌파' },
        text: 'Game Freak가 얼떨결에 Stardew 킬러를 만들어냈다. 그것도 완전 캐주얼한 차림으로.',
      },
      es: {
        headline: { label: 'Pokémon Pokopia supera los 4M' },
        text: 'Game Freak inventó por accidente el asesino de Stardew, y encima en chanclas.',
      },
      fr: {
        headline: { label: 'Pokémon Pokopia dépasse 4M' },
        text: 'Game Freak a inventé le tueur de Stardew par accident, et en tongs.',
      },
      de: {
        headline: { label: 'Pokémon Pokopia knackt 4M' },
        text: 'Game Freak hat versehentlich den Stardew-Killer erfunden — und das in Cargoshorts.',
      },
    },
  },
  {
    id: 'switch2-19m',
    headline: { label: 'Switch 2 · 19.86M units sold' },
    text: 'Sony does a State of Play, Microsoft does a showcase, Nintendo does a money printer 🖨️',
    translations: {
      ja: {
        headline: { label: 'Switch 2 · 1986万台販売' },
        text: 'ソニーは State of Play、Microsoft はショーケース、任天堂は札束印刷機 🖨️',
      },
      'zh-CN': {
        headline: { label: 'Switch 2 · 售出 1986 万台' },
        text: '索尼开 State of Play,微软开 Showcase,任天堂开印钞机 🖨️',
      },
      'zh-TW': {
        headline: { label: 'Switch 2 · 售出 1986 萬台' },
        text: '索尼開 State of Play,微軟開 Showcase,任天堂開印鈔機 🖨️',
      },
      ko: {
        headline: { label: 'Switch 2 · 1,986만 대 판매' },
        text: '소니는 State of Play, 마이크로소프트는 쇼케이스, 닌텐도는 지폐 인쇄기 🖨️',
      },
      es: {
        headline: { label: 'Switch 2 · 19,86M unidades vendidas' },
        text: 'Sony hace un State of Play, Microsoft un showcase, Nintendo una impresora de billetes 🖨️',
      },
      fr: {
        headline: { label: 'Switch 2 · 19,86M vendus' },
        text: "Sony fait un State of Play, Microsoft un showcase, Nintendo fait tourner l'imprimante à billets 🖨️",
      },
      de: {
        headline: { label: 'Switch 2 · 19,86 Mio. verkauft' },
        text: 'Sony macht ein State of Play, Microsoft ein Showcase, Nintendo einen Gelddrucker 🖨️',
      },
    },
  },
  {
    id: 'switch2-price',
    headline: { label: 'Switch 2 · $449 → $499 in US, Sept 1' },
    text: 'AI RAM prices doubled in Q1, tariffs piled on top. Nintendo also trimmed next-year forecast to 16.5M units (down from 19.86M) 🪙',
    translations: {
      ja: {
        headline: { label: 'Switch 2 · 米国で $449 → $499、9月1日から' },
        text: 'AI 用 RAM が Q1 で倍額、関税もそこに乗っかった。任天堂は来年の予測も 1650万台に下方修正(前は 1986万台) 🪙',
      },
      'zh-CN': {
        headline: { label: 'Switch 2 · 美国 $449 → $499,9月1日起' },
        text: 'AI 用 RAM 一季度价格翻倍,再加关税压顶。任天堂顺手把下一年预测调低到 1650 万台(原本 1986 万) 🪙',
      },
      'zh-TW': {
        headline: { label: 'Switch 2 · 美國 $449 → $499,9 月 1 日起' },
        text: 'AI 用 RAM 一季度價格翻倍,再加關稅壓頂。任天堂順手把下一年預測調低到 1650 萬台(原本 1986 萬) 🪙',
      },
      ko: {
        headline: { label: 'Switch 2 · 미국 $449 → $499, 9월 1일부터' },
        text: 'AI용 RAM 가격이 1분기 두 배로, 관세까지 쌓였다. 닌텐도는 내년 예측도 1,650만 대로 하향(원래 1,986만) 🪙',
      },
      es: {
        headline: { label: 'Switch 2 · $449 → $499 en EE. UU., 1 de sept.' },
        text: 'el precio de la RAM para IA se duplicó en Q1 y encima llegaron los aranceles. Nintendo recorta la previsión del próximo año a 16,5M (desde 19,86M) 🪙',
      },
      fr: {
        headline: { label: 'Switch 2 · $449 → $499 aux US, 1er sept.' },
        text: "la RAM pour l'IA a doublé au T1, les tarifs par-dessus. Nintendo abaisse aussi sa prévision de l'an prochain à 16,5M (contre 19,86M) 🪙",
      },
      de: {
        headline: { label: 'Switch 2 · $449 → $499 in den USA, 1. Sept.' },
        text: 'die Preise für AI-RAM haben sich in Q1 verdoppelt, Zölle obendrauf. Nintendo senkt die Prognose fürs nächste Jahr auf 16,5 Mio. (von 19,86 Mio.) 🪙',
      },
    },
  },

  // ── Big multi-platform launches (4) ──────────────────────────────────
  {
    id: 'direct-rumor',
    headline: { label: 'Nintendo Direct · rumored soon' },
    text: 'every insider is pointing to a general Direct dropping imminently. Nintendo neither confirms nor denies, just keeps shipping 🎬',
    translations: {
      ja: {
        headline: { label: 'Nintendo Direct · 開催間近の噂' },
        text: 'インサイダー全員が「そろそろ来る」と示唆。任天堂は肯定も否定もせず、ただ出し続ける 🎬',
      },
      'zh-CN': {
        headline: { label: 'Nintendo Direct · 传闻即将开播' },
        text: '所有内部人士都在指向一场综合 Direct 即将到来。任天堂不承认也不否认,只管持续发货 🎬',
      },
      'zh-TW': {
        headline: { label: 'Nintendo Direct · 傳聞即將開播' },
        text: '所有內部人士都在指向一場綜合 Direct 即將到來。任天堂不承認也不否認,只管持續出貨 🎬',
      },
      ko: {
        headline: { label: 'Nintendo Direct · 곧 개최설' },
        text: '모든 인사이더가 일반 Direct가 임박했다고 시사. 닌텐도는 인정도 부인도 없이, 그저 계속 배송 🎬',
      },
      es: {
        headline: { label: 'Nintendo Direct · rumor inminente' },
        text: 'todos los insiders apuntan a un Direct general a punto de caer. Nintendo ni confirma ni desmiente, solo sigue enviando juegos 🎬',
      },
      fr: {
        headline: { label: 'Nintendo Direct · rumeur imminente' },
        text: 'tous les insiders pointent vers un Direct général sur le point de tomber. Nintendo ne confirme ni ne dément, continue juste à livrer 🎬',
      },
      de: {
        headline: { label: 'Nintendo Direct · Gerücht steht bald' },
        text: 'alle Insider deuten auf eine allgemeine Direct in Kürze hin. Nintendo bestätigt weder noch dementiert, liefert einfach weiter 🎬',
      },
    },
  },
  {
    id: 'take-two-earnings',
    headline: { label: 'Take-Two earnings · GTA 6 still on track' },
    text: 'Strauss Zelnick reaffirmed Nov 19 on the latest call. the streets remain unmade, but on schedule 📈',
    translations: {
      ja: {
        headline: { label: 'Take-Two 決算 · GTA 6 は予定通り' },
        text: 'Strauss Zelnick が最新決算で 11月19日を再確認。ストリートはまだ未完成、でも予定通り 📈',
      },
      'zh-CN': {
        headline: { label: 'Take-Two 财报 · GTA 6 仍按计划' },
        text: 'Strauss Zelnick 在最新电话会上再次确认 11 月 19 日。街道仍未成型,但仍按计划推进 📈',
      },
      'zh-TW': {
        headline: { label: 'Take-Two 財報 · GTA 6 仍按計畫' },
        text: 'Strauss Zelnick 在最新電話會上再次確認 11 月 19 日。街道仍未成型,但仍按計畫推進 📈',
      },
      ko: {
        headline: { label: 'Take-Two 실적 · GTA 6 예정대로' },
        text: 'Strauss Zelnick가 최신 컨퍼런스 콜에서 11월 19일을 재확인. 거리는 여전히 미완성, 그래도 일정대로 📈',
      },
      es: {
        headline: { label: 'Resultados Take-Two · GTA 6 sigue en fecha' },
        text: 'Strauss Zelnick reafirmó el 19 de noviembre en la última call. las calles siguen sin construir, pero en calendario 📈',
      },
      fr: {
        headline: { label: 'Résultats Take-Two · GTA 6 toujours en date' },
        text: 'Strauss Zelnick a reconfirmé le 19 novembre lors du dernier call. les rues ne sont toujours pas construites, mais dans les temps 📈',
      },
      de: {
        headline: { label: 'Take-Two-Zahlen · GTA 6 bleibt im Plan' },
        text: 'Strauss Zelnick hat den 19. November im letzten Call bekräftigt. die Straßen sind weiter ungebaut, aber im Zeitplan 📈',
      },
    },
  },
  {
    id: 'bond-out-now',
    headline: { label: '007 First Light · out now' },
    text: "young Bond, full stealth-action. IO Interactive's pivot from Hitman to Bond is the smoothest M&A in gaming 🍸",
    translations: {
      ja: {
        headline: { label: '007 First Light · 発売中' },
        text: '若きボンド、フル・ステルスアクション。Hitman から Bond への IO Interactive のピボットは、ゲーム業界屈指のスムーズな M&A 🍸',
      },
      'zh-CN': {
        headline: { label: '007 First Light · 已发售' },
        text: '年轻版邦德,纯潜行动作。IO Interactive 从 Hitman 转到 Bond 是游戏业最丝滑的一次“并购” 🍸',
      },
      'zh-TW': {
        headline: { label: '007 First Light · 已發售' },
        text: '年輕版龐德,純潛行動作。IO Interactive 從 Hitman 轉到 Bond 是遊戲業最絲滑的一次「併購」 🍸',
      },
      ko: {
        headline: { label: '007 First Light · 발매' },
        text: '젊은 본드, 풀 스텔스 액션. IO Interactive의 Hitman → Bond 피봇은 게임 업계 사상 가장 매끄러운 M&A 🍸',
      },
      es: {
        headline: { label: '007 First Light · ya disponible' },
        text: 'el joven Bond, sigilo puro. el giro de IO Interactive de Hitman a Bond es la M&A más suave del gaming 🍸',
      },
      fr: {
        headline: { label: '007 First Light · disponible' },
        text: "le jeune Bond, action-infiltration pure. le pivot d'IO Interactive de Hitman à Bond, c'est la M&A la plus lisse du gaming 🍸",
      },
      de: {
        headline: { label: '007 First Light · jetzt draußen' },
        text: 'junger Bond, volle Stealth-Action. IO Interactives Pivot von Hitman zu Bond ist die geschmeidigste M&A der Gaming-Branche 🍸',
      },
    },
  },
  {
    id: 'castlevania-belmont',
    headline: { label: "Castlevania: Belmont's Curse" },
    text: 'Konami × Motion Twin (Dead Cells). best decision Konami has made in 15 years. low bar — still counts.',
    translations: {
      ja: {
        headline: { label: '悪魔城ドラキュラ: Belmont\'s Curse' },
        text: 'コナミ × Motion Twin(Dead Cells)。コナミが 15 年でくだした最良の判断。基準は低いけど、それでもカウントする。',
      },
      'zh-CN': {
        headline: { label: '恶魔城:Belmont\'s Curse' },
        text: 'Konami × Motion Twin(Dead Cells)。Konami 十五年来做的最好决定。门槛虽低,但也算数。',
      },
      'zh-TW': {
        headline: { label: '惡魔城:Belmont\'s Curse' },
        text: 'Konami × Motion Twin(Dead Cells)。Konami 十五年來做的最好決定。門檻雖低,但也算數。',
      },
      ko: {
        headline: { label: '캐슬바니아: Belmont\'s Curse' },
        text: '코나미 × Motion Twin(Dead Cells). 코나미가 15년 만에 내린 최고의 결정. 기준이 낮긴 하지만, 그래도 카운트.',
      },
      es: {
        headline: { label: "Castlevania: Belmont's Curse" },
        text: 'Konami × Motion Twin (Dead Cells). la mejor decisión que ha tomado Konami en 15 años. el listón está bajo, pero cuenta igual.',
      },
      fr: {
        headline: { label: "Castlevania: Belmont's Curse" },
        text: 'Konami × Motion Twin (Dead Cells). la meilleure décision de Konami en 15 ans. le niveau est bas — ça compte quand même.',
      },
      de: {
        headline: { label: "Castlevania: Belmont's Curse" },
        text: 'Konami × Motion Twin (Dead Cells). die beste Entscheidung, die Konami in 15 Jahren getroffen hat. niedrige Latte — zählt trotzdem.',
      },
    },
  },

  // ── Hype + market commentary (6) ─────────────────────────────────────
  {
    id: 'gta6-nov',
    headline: { label: 'GTA 6 delayed to Nov 19, 2026' },
    text: "Strauss Zelnick is single-handedly keeping the 'soon™' meme alive. the streets remain unmade.",
    translations: {
      ja: {
        headline: { label: 'GTA 6 · 2026年11月19日に延期' },
        text: 'Strauss Zelnick 一人で「soon™」ミームを守り続けている。ストリートは未だ未完成のまま。',
      },
      'zh-CN': {
        headline: { label: 'GTA 6 跳票至 2026 年 11 月 19 日' },
        text: 'Strauss Zelnick 一个人硬撑起“soon™”这个梗。街道仍未成形。',
      },
      'zh-TW': {
        headline: { label: 'GTA 6 跳票至 2026 年 11 月 19 日' },
        text: 'Strauss Zelnick 一個人硬撐起「soon™」這個梗。街道仍未成形。',
      },
      ko: {
        headline: { label: 'GTA 6 · 2026년 11월 19일로 연기' },
        text: 'Strauss Zelnick 혼자서 "soon™" 밈을 지키고 있다. 거리는 여전히 미완성.',
      },
      es: {
        headline: { label: 'GTA 6 aplazado al 19 de nov. de 2026' },
        text: 'Strauss Zelnick sostiene él solo el meme del "soon™". las calles siguen sin construir.',
      },
      fr: {
        headline: { label: 'GTA 6 repoussé au 19 nov. 2026' },
        text: "Strauss Zelnick tient à lui seul le mème du « soon™ ». les rues restent à construire.",
      },
      de: {
        headline: { label: 'GTA 6 verschoben auf den 19. Nov. 2026' },
        text: 'Strauss Zelnick hält das „soon™"-Meme im Alleingang am Leben. die Straßen bleiben ungebaut.',
      },
    },
  },
  {
    id: 'handhelds-2026',
    headline: { label: '2026 handheld market check' },
    text: 'Switch 2 (printing), Steam Deck 2 (cooking), ROG Ally X (refusing to lose), Lenovo Legion Go (vibing). pick a fighter.',
    translations: {
      ja: {
        headline: { label: '2026年 携帯機マーケット' },
        text: 'Switch 2(印刷中)、Steam Deck 2(仕込み中)、ROG Ally X(負けない気)、Lenovo Legion Go(のんびり)。推しを選べ。',
      },
      'zh-CN': {
        headline: { label: '2026 掌机市场速览' },
        text: 'Switch 2(印钞)、Steam Deck 2(酝酿)、ROG Ally X(不服输)、Lenovo Legion Go(佛系)。选个战士。',
      },
      'zh-TW': {
        headline: { label: '2026 掌機市場速覽' },
        text: 'Switch 2(印鈔)、Steam Deck 2(醞釀)、ROG Ally X(不服輸)、Lenovo Legion Go(佛系)。選個戰士。',
      },
      ko: {
        headline: { label: '2026 휴대기 시장 체크' },
        text: 'Switch 2(인쇄 중), Steam Deck 2(요리 중), ROG Ally X(지지 않는 정신), Lenovo Legion Go(바이브). 파이터를 골라라.',
      },
      es: {
        headline: { label: 'Repaso al mercado de portátiles 2026' },
        text: 'Switch 2 (imprimiendo), Steam Deck 2 (cocinándose), ROG Ally X (no acepta la derrota), Lenovo Legion Go (vibrando). elige a tu luchador.',
      },
      fr: {
        headline: { label: 'Point marché portables 2026' },
        text: 'Switch 2 (imprime), Steam Deck 2 (mijote), ROG Ally X (refuse de perdre), Lenovo Legion Go (chill). choisis ton combattant.',
      },
      de: {
        headline: { label: '2026 Handheld-Marktcheck' },
        text: 'Switch 2 (druckt), Steam Deck 2 (köchelt), ROG Ally X (will nicht verlieren), Lenovo Legion Go (chillt). wähl deinen Fighter.',
      },
    },
  },
  {
    id: 'steam-controller-soldout',
    headline: { label: 'Steam Controller sold out in 30 min' },
    text: "Valve's opening a reservation queue. word on the street: Genki's cooking one that outperforms it 👀",
    translations: {
      ja: {
        headline: { label: 'Steam Controller · 30分で完売' },
        text: 'Valve は予約列を開放中。噂では Genki もそれを超えるやつを仕込み中とか 👀',
      },
      'zh-CN': {
        headline: { label: 'Steam Controller · 30 分钟售罄' },
        text: 'Valve 开放预约排队。据说 Genki 正在憋一个更强的对手 👀',
      },
      'zh-TW': {
        headline: { label: 'Steam Controller · 30 分鐘售罄' },
        text: 'Valve 開放預約排隊。據說 Genki 正在憋一個更強的對手 👀',
      },
      ko: {
        headline: { label: 'Steam Controller · 30분 만에 매진' },
        text: 'Valve가 예약 대기줄 오픈. 소문에는 Genki도 그걸 능가하는 물건을 준비 중이라고 👀',
      },
      es: {
        headline: { label: 'Steam Controller agotado en 30 min' },
        text: 'Valve abre lista de reservas. rumor: Genki está cocinando uno que lo supera 👀',
      },
      fr: {
        headline: { label: 'Steam Controller épuisé en 30 min' },
        text: "Valve ouvre une file d'attente pour réservation. rumeur : Genki en mijote un qui le dépasse 👀",
      },
      de: {
        headline: { label: 'Steam Controller in 30 Min. ausverkauft' },
        text: 'Valve öffnet eine Reservierungsschlange. Gerücht: Genki brütet einen aus, der ihn übertrifft 👀',
      },
    },
  },
  {
    id: 'stellar-blade-2-self-publish',
    headline: { label: 'Stellar Blade 2 drops Sony' },
    text: 'Shift Up will self-publish the sequel — "broad global audience" is corporate code for "no more PlayStation exclusivity." reveal before end of 2026 👋',
    translations: {
      ja: {
        headline: { label: 'Stellar Blade 2 · ソニーから離脱' },
        text: 'Shift Up が続編をセルフパブリッシング。「幅広いグローバル層」は「PlayStation 独占はもうやらない」の企業語訳。2026 年内に発表 👋',
      },
      'zh-CN': {
        headline: { label: 'Stellar Blade 2 甩开索尼' },
        text: 'Shift Up 将自行发行续作 —— “更广泛的全球受众”是“不再 PlayStation 独占”的企业黑话。2026 年年底前公布 👋',
      },
      'zh-TW': {
        headline: { label: 'Stellar Blade 2 甩開索尼' },
        text: 'Shift Up 將自行發行續作 —— 「更廣泛的全球受眾」是「不再 PlayStation 獨佔」的企業黑話。2026 年年底前公布 👋',
      },
      ko: {
        headline: { label: 'Stellar Blade 2 · 소니 하차' },
        text: 'Shift Up가 후속작을 자체 퍼블리싱. "폭넓은 글로벌 관객"은 "더 이상 PlayStation 독점은 없다"의 기업어. 2026년 안에 공개 👋',
      },
      es: {
        headline: { label: 'Stellar Blade 2 se baja de Sony' },
        text: 'Shift Up publicará la secuela por su cuenta — "audiencia global amplia" es código corporativo para "adiós a la exclusividad PlayStation." reveal antes de fin de 2026 👋',
      },
      fr: {
        headline: { label: 'Stellar Blade 2 quitte Sony' },
        text: 'Shift Up éditera la suite en propre — « large public mondial » est le mot de code corporate pour « fini l\'exclu PlayStation ». révélation avant fin 2026 👋',
      },
      de: {
        headline: { label: 'Stellar Blade 2 verlässt Sony' },
        text: 'Shift Up bringt den Nachfolger selbst heraus — „breites globales Publikum" ist Firmensprech für „keine PlayStation-Exklusivität mehr". Enthüllung noch 2026 👋',
      },
    },
  },
  {
    id: 'fromsoft-cerulean',
    headline: { label: 'FromSoft · "Cerulean Onslaught" leak' },
    text: 'rumored single-player project pegged for an SGF reveal. Soulsborne fans already pre-suffering 🗡️',
    translations: {
      ja: {
        headline: { label: 'フロム・ソフトウェア · 「Cerulean Onslaught」リーク' },
        text: 'SGF での発表が予定されているとされるシングルプレイ新作。ソウルライク勢はもう予習で苦しんでる 🗡️',
      },
      'zh-CN': {
        headline: { label: 'FromSoft · “Cerulean Onslaught”疑似泄露' },
        text: '据传单机新作瞄准 SGF 发布。魂类玩家已经开始预习受苦 🗡️',
      },
      'zh-TW': {
        headline: { label: 'FromSoft · 「Cerulean Onslaught」疑似洩露' },
        text: '據傳單機新作瞄準 SGF 發表。魂類玩家已經開始預習受苦 🗡️',
      },
      ko: {
        headline: { label: '프롬 소프트웨어 · "Cerulean Onslaught" 유출' },
        text: 'SGF 공개 예정으로 알려진 싱글플레이 신작. 소울라이크 팬들은 이미 예습하며 고통 중 🗡️',
      },
      es: {
        headline: { label: 'FromSoft · filtración de "Cerulean Onslaught"' },
        text: 'proyecto single-player supuestamente reservado para el SGF. los fans de Soulsborne ya sufren por adelantado 🗡️',
      },
      fr: {
        headline: { label: 'FromSoft · fuite « Cerulean Onslaught »' },
        text: 'un projet solo qui aurait rendez-vous avec le SGF. les fans de Soulsborne souffrent déjà en avance 🗡️',
      },
      de: {
        headline: { label: 'FromSoft · „Cerulean Onslaught"-Leak' },
        text: 'angebliches Single-Player-Projekt für die SGF-Enthüllung gesetzt. Soulsborne-Fans leiden schon präventiv 🗡️',
      },
    },
  },
  {
    id: 'steam-next-summer',
    headline: { label: 'Steam Next Fest · coming soon' },
    text: 'a full week of free demos incoming. wishlist anxiety: peak. SSD: full 💾',
    translations: {
      ja: {
        headline: { label: 'Steam Next Fest · 開催間近' },
        text: '無料デモが 1 週間ドバっと来る。ウィッシュリスト不安: MAX、SSD: 満タン 💾',
      },
      'zh-CN': {
        headline: { label: 'Steam Next Fest · 即将开幕' },
        text: '整整一周免费 Demo 来袭。愿望单焦虑:峰值。SSD:爆满 💾',
      },
      'zh-TW': {
        headline: { label: 'Steam Next Fest · 即將開幕' },
        text: '整整一週免費 Demo 來襲。願望清單焦慮:峰值。SSD:爆滿 💾',
      },
      ko: {
        headline: { label: 'Steam Next Fest · 개막 임박' },
        text: '무료 데모가 일주일 내내 쏟아진다. 위시리스트 불안: 최고치. SSD: 만땅 💾',
      },
      es: {
        headline: { label: 'Steam Next Fest · pronto' },
        text: 'una semana entera de demos gratis en camino. ansiedad de wishlist: máxima. SSD: lleno 💾',
      },
      fr: {
        headline: { label: 'Steam Next Fest · bientôt' },
        text: 'une semaine complète de démos gratuites arrive. anxiété wishlist : au max. SSD : plein 💾',
      },
      de: {
        headline: { label: 'Steam Next Fest · kommt gleich' },
        text: 'eine ganze Woche voller Gratis-Demos steht an. Wishlist-Angst: Peak. SSD: voll 💾',
      },
    },
  },

  // ── Industry / community (2) ─────────────────────────────────────────
  {
    id: 'gamestop-ebay-bid',
    headline: { label: 'GameStop CEO banned from eBay' },
    text: "Ryan Cohen reportedly wants to acquire eBay. eBay's response: ban his account. mid-acquisition, mid-tweet, nothing about this is normal corporate finance 📦",
    translations: {
      ja: {
        headline: { label: 'GameStop の CEO · eBay から BAN' },
        text: 'Ryan Cohen が eBay 買収を狙っているという報道。eBay の対応:アカウントを凍結。買収話の途中、ツイートの途中、何一つ普通のコーポレートファイナンスじゃない 📦',
      },
      'zh-CN': {
        headline: { label: 'GameStop CEO 被 eBay 封号' },
        text: '有报道称 Ryan Cohen 想收购 eBay。eBay 的回应:封他账号。收购谈判进行中、推文发到一半,这场戏没一处像正常的企业金融 📦',
      },
      'zh-TW': {
        headline: { label: 'GameStop CEO 被 eBay 封號' },
        text: '有報導稱 Ryan Cohen 想併購 eBay。eBay 的回應:封他帳號。併購談判進行中、推文發到一半,這場戲沒一處像正常的企業金融 📦',
      },
      ko: {
        headline: { label: 'GameStop CEO, eBay에서 BAN' },
        text: '보도에 따르면 Ryan Cohen이 eBay 인수를 노리는 중. eBay의 대응: 계정 정지. 인수 협상 중, 트윗 중, 어느 하나 정상적인 기업 금융이 아니다 📦',
      },
      es: {
        headline: { label: 'El CEO de GameStop, baneado de eBay' },
        text: 'según informes, Ryan Cohen quiere adquirir eBay. la respuesta de eBay: banear su cuenta. en plena adquisición, en pleno tuit, nada de esto es finanza corporativa normal 📦',
      },
      fr: {
        headline: { label: 'Le CEO de GameStop banni d\'eBay' },
        text: "selon les rapports, Ryan Cohen voudrait acquérir eBay. réponse d'eBay : bannir son compte. en pleine acquisition, en plein tweet, rien de tout ça n'est de la finance d'entreprise normale 📦",
      },
      de: {
        headline: { label: 'GameStop-CEO auf eBay gesperrt' },
        text: 'Berichten zufolge will Ryan Cohen eBay übernehmen. eBays Antwort: Kontosperre. mitten in der Übernahme, mitten im Tweet, nichts an dem Ganzen ist normale Unternehmensfinanzierung 📦',
      },
    },
  },
  {
    id: 'discord-xbox-gp',
    headline: { label: 'Discord Nitro · now with Game Pass' },
    text: 'Nitro subs get the Xbox Game Pass base tier free as of May 11. Microsoft seeding funnels through the platform they sold five years ago 🎮',
    translations: {
      ja: {
        headline: { label: 'Discord Nitro · Game Pass 付属' },
        text: '5月11日から Nitro 会員は Xbox Game Pass ベース層が無料で使える。Microsoft が 5 年前に手放したプラットフォームで導線を仕込む 🎮',
      },
      'zh-CN': {
        headline: { label: 'Discord Nitro · 现附赠 Game Pass' },
        text: '自 5 月 11 日起,Nitro 订阅者免费享有 Xbox Game Pass 基础档。微软借着五年前卖掉的平台在悄悄埋管道 🎮',
      },
      'zh-TW': {
        headline: { label: 'Discord Nitro · 現附贈 Game Pass' },
        text: '自 5 月 11 日起,Nitro 訂閱者免費享有 Xbox Game Pass 基礎檔。微軟借著五年前賣掉的平台在悄悄埋管道 🎮',
      },
      ko: {
        headline: { label: 'Discord Nitro · 이제 Game Pass 포함' },
        text: '5월 11일부터 Nitro 구독자는 Xbox Game Pass 베이스 티어를 무료로 사용. Microsoft가 5년 전에 팔아버린 플랫폼에서 유입 파이프라인을 심는 중 🎮',
      },
      es: {
        headline: { label: 'Discord Nitro · ahora con Game Pass' },
        text: 'desde el 11 de mayo, los suscriptores de Nitro obtienen el nivel base de Xbox Game Pass gratis. Microsoft sembrando embudos a través de la plataforma que vendió hace cinco años 🎮',
      },
      fr: {
        headline: { label: 'Discord Nitro · désormais avec Game Pass' },
        text: "depuis le 11 mai, les abonnés Nitro ont le palier de base du Xbox Game Pass offert. Microsoft plante des entonnoirs via la plateforme qu'il a vendue il y a cinq ans 🎮",
      },
      de: {
        headline: { label: 'Discord Nitro · jetzt mit Game Pass' },
        text: 'seit dem 11. Mai bekommen Nitro-Abonnenten die Basisstufe des Xbox Game Pass gratis. Microsoft baut Trichter über die Plattform, die sie vor fünf Jahren verkauft haben 🎮',
      },
    },
  },
];

// Fisher-Yates shuffle so each visit sees a different first message.
export function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Resolve a news item's rendered fields for the active locale. Missing
 * translations fall back to the English source. Callers should pass this
 * the current LanguageCode from the i18n hook.
 */
export function localizeNewsItem(
  item: NewsItem,
  lang: LanguageCode,
): {
  headline?: { label: string; href?: string };
  text: string;
  link?: { href: string; label: string };
} {
  if (lang === 'en' || !item.translations) {
    return { headline: item.headline, text: item.text, link: item.link };
  }
  const t = item.translations[lang];
  if (!t) {
    return { headline: item.headline, text: item.text, link: item.link };
  }
  return {
    headline: t.headline
      ? { label: t.headline.label, href: item.headline?.href }
      : item.headline,
    text: t.text ?? item.text,
    link:
      item.link && t.link
        ? { href: item.link.href, label: t.link.label }
        : item.link,
  };
}
