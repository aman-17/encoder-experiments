// Multilingual label packs for synthetic charts. The chart's category/series/axis
// labels are DETERMINISTIC (not from the LLM) so the ground truth (chartDataPoints
// -> gold.md) is exact and round-trippable — the localized strings flow verbatim
// into the gold. Verified (render test) that Chrome's macOS fallback renders every
// script below and embeds the glyphs into the PDF, so output is self-contained.

// weighted so ~half stay English, the rest spread across scripts.
export function pickLocale(rng) {
    return rng.weighted([
        ["en", 12], ["es", 2], ["fr", 2], ["de", 2], ["pt", 1], ["it", 1],
        ["ru", 2], ["zh", 2], ["ja", 2], ["ar", 1], ["hi", 1],
    ]);
}
export const LANG_NAME = {
    en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian",
    ru: "Russian", zh: "Simplified Chinese", ja: "Japanese", ar: "Arabic", hi: "Hindi",
};
export const RTL = new Set(["ar"]);

const M = (s) => s.split("|");
const L = {
    en: { q: "Q", months: M("Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"),
        regions: M("North|South|East|West|Central|Coastal|Inland|Metro"),
        segments: M("Retail|Wholesale|Online|Direct|Partner|Public|Enterprise|SMB"),
        series: M("Revenue|Cost|EBITDA|Units|Margin|Forecast|Actual|Budget|Prior Year|Plan|Net|Gross"),
        yTitles: M("Value|Amount|Units|Share (%)|Index|Count|Rate|Volume"),
        axis: { year: "Year", quarter: "Quarter", month: "Month", region: "Region", segment: "Segment", age: "Age Group" } },
    es: { q: "T", months: M("Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic"),
        regions: M("Norte|Sur|Este|Oeste|Centro|Costa|Interior|Metro"),
        segments: M("Minorista|Mayorista|En línea|Directo|Socio|Público|Empresa|Pyme"),
        series: M("Ingresos|Costo|EBITDA|Unidades|Margen|Pronóstico|Real|Presupuesto|Año previo|Plan|Neto|Bruto"),
        yTitles: M("Valor|Importe|Unidades|Cuota (%)|Índice|Recuento|Tasa|Volumen"),
        axis: { year: "Año", quarter: "Trimestre", month: "Mes", region: "Región", segment: "Segmento", age: "Grupo de edad" } },
    fr: { q: "T", months: M("Janv|Févr|Mars|Avr|Mai|Juin|Juil|Août|Sept|Oct|Nov|Déc"),
        regions: M("Nord|Sud|Est|Ouest|Centre|Littoral|Intérieur|Métro"),
        segments: M("Détail|Gros|En ligne|Direct|Partenaire|Public|Entreprise|PME"),
        series: M("Revenu|Coût|EBITDA|Unités|Marge|Prévision|Réel|Budget|Année N-1|Plan|Net|Brut"),
        yTitles: M("Valeur|Montant|Unités|Part (%)|Indice|Nombre|Taux|Volume"),
        axis: { year: "Année", quarter: "Trimestre", month: "Mois", region: "Région", segment: "Segment", age: "Tranche d'âge" } },
    de: { q: "Q", months: M("Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez"),
        regions: M("Nord|Süd|Ost|West|Zentral|Küste|Binnenland|Metro"),
        segments: M("Einzelhandel|Großhandel|Online|Direkt|Partner|Öffentlich|Konzern|KMU"),
        series: M("Umsatz|Kosten|EBITDA|Einheiten|Marge|Prognose|Ist|Budget|Vorjahr|Plan|Netto|Brutto"),
        yTitles: M("Wert|Betrag|Einheiten|Anteil (%)|Index|Anzahl|Rate|Volumen"),
        axis: { year: "Jahr", quarter: "Quartal", month: "Monat", region: "Region", segment: "Segment", age: "Altersgruppe" } },
    pt: { q: "T", months: M("Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez"),
        regions: M("Norte|Sul|Leste|Oeste|Centro|Costa|Interior|Metro"),
        segments: M("Varejo|Atacado|Online|Direto|Parceiro|Público|Empresa|PME"),
        series: M("Receita|Custo|EBITDA|Unidades|Margem|Previsão|Real|Orçamento|Ano anterior|Plano|Líquido|Bruto"),
        yTitles: M("Valor|Montante|Unidades|Quota (%)|Índice|Contagem|Taxa|Volume"),
        axis: { year: "Ano", quarter: "Trimestre", month: "Mês", region: "Região", segment: "Segmento", age: "Faixa etária" } },
    it: { q: "T", months: M("Gen|Feb|Mar|Apr|Mag|Giu|Lug|Ago|Set|Ott|Nov|Dic"),
        regions: M("Nord|Sud|Est|Ovest|Centro|Costa|Interno|Metro"),
        segments: M("Dettaglio|Ingrosso|Online|Diretto|Partner|Pubblico|Impresa|PMI"),
        series: M("Ricavi|Costo|EBITDA|Unità|Margine|Previsione|Effettivo|Budget|Anno prec.|Piano|Netto|Lordo"),
        yTitles: M("Valore|Importo|Unità|Quota (%)|Indice|Conteggio|Tasso|Volume"),
        axis: { year: "Anno", quarter: "Trimestre", month: "Mese", region: "Regione", segment: "Segmento", age: "Fascia d'età" } },
    ru: { q: "Кв", months: M("Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек"),
        regions: M("Север|Юг|Восток|Запад|Центр|Побережье|Внутренний|Метро"),
        segments: M("Розница|Опт|Онлайн|Прямой|Партнёр|Госсектор|Корпорации|МСБ"),
        series: M("Выручка|Затраты|EBITDA|Единицы|Маржа|Прогноз|Факт|Бюджет|Прошлый год|План|Чистый|Валовой"),
        yTitles: M("Значение|Сумма|Единицы|Доля (%)|Индекс|Количество|Ставка|Объём"),
        axis: { year: "Год", quarter: "Квартал", month: "Месяц", region: "Регион", segment: "Сегмент", age: "Возраст" } },
    zh: { q: "Q", months: M("1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月"),
        regions: M("北部|南部|东部|西部|中部|沿海|内陆|都市"),
        segments: M("零售|批发|线上|直销|合作|公共|企业|中小企业"),
        series: M("收入|成本|EBITDA|数量|利润率|预测|实际|预算|上年|计划|净额|总额"),
        yTitles: M("数值|金额|数量|占比 (%)|指数|计数|比率|规模"),
        axis: { year: "年", quarter: "季度", month: "月", region: "地区", segment: "细分", age: "年龄组" } },
    ja: { q: "Q", months: M("1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月"),
        regions: M("北部|南部|東部|西部|中部|沿岸|内陸|都市"),
        segments: M("小売|卸売|オンライン|直販|提携|公共|大企業|中小"),
        series: M("収益|費用|EBITDA|数量|利益率|予測|実績|予算|前年|計画|純額|総額"),
        yTitles: M("値|金額|数量|割合 (%)|指数|件数|率|規模"),
        axis: { year: "年", quarter: "四半期", month: "月", region: "地域", segment: "セグメント", age: "年齢層" } },
    ar: { q: "ر", months: M("يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر"),
        regions: M("الشمال|الجنوب|الشرق|الغرب|الوسط|الساحل|الداخل|المدينة"),
        segments: M("تجزئة|جملة|إلكتروني|مباشر|شريك|عام|مؤسسات|صغيرة"),
        series: M("الإيرادات|التكلفة|EBITDA|الوحدات|الهامش|التوقعات|الفعلي|الميزانية|العام السابق|الخطة|صافي|إجمالي"),
        yTitles: M("القيمة|المبلغ|الوحدات|الحصة (%)|المؤشر|العدد|المعدل|الحجم"),
        axis: { year: "السنة", quarter: "الربع", month: "الشهر", region: "المنطقة", segment: "القطاع", age: "الفئة العمرية" } },
    hi: { q: "ति", months: M("जन|फ़र|मार्च|अप्रैल|मई|जून|जुल|अग|सित|अक्ट|नव|दिस"),
        regions: M("उत्तर|दक्षिण|पूर्व|पश्चिम|मध्य|तटीय|भीतरी|महानगर"),
        segments: M("खुदरा|थोक|ऑनलाइन|प्रत्यक्ष|साझेदार|सार्वजनिक|उद्यम|एमएसएमई"),
        series: M("राजस्व|लागत|EBITDA|इकाइयाँ|मार्जिन|पूर्वानुमान|वास्तविक|बजट|पिछला वर्ष|योजना|शुद्ध|सकल"),
        yTitles: M("मान|राशि|इकाइयाँ|हिस्सा (%)|सूचकांक|गणना|दर|आयतन"),
        axis: { year: "वर्ष", quarter: "तिमाही", month: "माह", region: "क्षेत्र", segment: "खंड", age: "आयु वर्ग" } },
};

export function loc(locale) { return L[locale] || L.en; }

// localized category generator: year (numeric), quarter (localized prefix), month,
// region, segment (localized pools), age (numeric ranges).
export function catLabels(locale, kind, n) {
    const t = loc(locale);
    if (kind === "year") { return Array.from({ length: n }, (_, i) => String(2016 + i)); }
    if (kind === "quarter") { return Array.from({ length: n }, (_, i) => `${t.q}${(i % 4) + 1} '${String(19 + Math.floor(i / 4)).padStart(2, "0")}`); }
    if (kind === "month") { return t.months.slice(0, Math.min(12, n)); }
    if (kind === "age") { return ["0-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"].slice(0, n); }
    return (t[kind] || t.regions).slice(0, n); // region / segment
}
