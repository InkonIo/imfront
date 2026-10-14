/**
 * Workflow директора ресторана 2026 (версия февраль 2026). Источник — Excel «WF ... 2026».
 * freq: day — ежедневно, week — еженедельно, month — ежемесячно, quarter — ежеквартально, half — раз в полгода, year — раз в год.
 * byMonth: задание не на весь период, а в конкретные месяцы (номер месяца → что именно делать).
 */
export type Freq = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year'

export interface WfSection { id: string; title: string; icon: string }
export interface WfItem {
  id: string; section: string; freq: Freq; text: string
  /** Короткое название для календаря года. */
  short?: string
  /** Месяц (1–12) → что делать в этом месяце. Пока месяца нет в списке — задание в нём не нужно. */
  byMonth?: Record<number, string>
}

export const SECTIONS: WfSection[] = [
  { id: 'kkch', title: 'ККЧ', icon: '⭐' },
  { id: 'people', title: 'Люди', icon: '👥' },
  { id: 'turnover', title: 'Товарооборот', icon: '📈' },
  { id: 'profit', title: 'Прибыль', icon: '💰' },
  { id: 'admin', title: 'Администрирование', icon: '🗂' },
]

export const FREQ_LABEL: Record<Freq, string> = {
  day: 'Сегодня', week: 'Неделя', month: 'Месяц', quarter: 'Квартал', half: 'Полгода', year: 'Год',
}
export const FREQ_NOUN: Record<Freq, string> = {
  day: 'ежедневно', week: 'еженедельно', month: 'ежемесячно', quarter: 'раз в квартал', half: 'раз в полгода', year: 'раз в год',
}

const counters: Record<string, number> = {}
function it(section: string, freq: Freq, text: string, extra: Partial<WfItem> = {}): WfItem {
  const k = `${section}.${freq}`
  counters[k] = (counters[k] ?? 0) + 1
  return { id: `${k}.${counters[k]}`, section, freq, text, ...extra }
}

const CONCEPTS: Record<number, string> = { 1: 'Delivery', 2: 'Управление сменой (PACE)', 4: 'Delivery', 5: 'Управление сменой (PACE)', 7: 'Delivery', 8: 'Управление сменой (PACE)', 10: 'Delivery', 11: 'Управление сменой (PACE)' }
const UNITS: Record<number, string> = { 1: 'DLV / ЛГ', 2: 'DLK / NT / MR', 5: 'DLV / ЛГ', 6: 'DLK / NT / MR', 8: 'DLV / ЛГ', 9: 'DLK / NT / MR', 11: 'DLV / ЛГ', 12: 'DLK / NT / MR' }

export const ITEMS: WfItem[] = [
  // ---------- ККЧ
  it('kkch', 'day', 'Обход ресторана «глазами посетителя», 15-ки с инсайдами'),
  it('kkch', 'day', 'Общение с посетителями, книга отзывов, I\'M Voice'),
  it('kkch', 'day', 'Ежедневный анализ уровня ККЧ в пиковые часы'),
  it('kkch', 'week', 'Проверка расписания работников'),
  it('kkch', 'month', 'Инженерный обход'),
  it('kkch', 'month', 'Приём работы у ночной смены / ПТО'),
  it('kkch', 'month', 'Анализ стаффинг-плана'),
  it('kkch', 'month', 'Проверка заказа. Таблицы 24/2 (выдержки)'),
  it('kkch', 'month', 'Заполнение FS чек-листа. Проверка архива FS'),
  it('kkch', 'quarter', 'Ночная смена (ресторан с ночной торговлей — 1 смена в 2 месяца, без ночной торговли — 1 смена в 3 месяца)'),
  it('kkch', 'quarter', 'Оценка работы концепций: директором — Delivery, Управление сменой — PACE', { short: 'Оценка концепций', byMonth: CONCEPTS }),
  it('kkch', 'quarter', 'Составление/обновление и контроль выполнения плана действий по итогам визитов PACE'),
  it('kkch', 'year', 'Spring Up', { short: 'Spring Up', byMonth: { 4: 'Spring Up' } }),

  // ---------- ЛЮДИ
  it('people', 'day', 'Приём — собеседование'),
  it('people', 'week', 'Оценка менеджеров смен (5 в месяц) / руководство сменой'),
  it('people', 'week', '1-я, 2-я ориентации (сколько раз в месяц — зависит от интенсивности приёма)'),
  it('people', 'week', 'Приём прогресс-листов у менеджеров'),
  it('people', 'week', 'Встречи по развитию с заместителями (согласно плану)'),
  it('people', 'week', 'Вынесение взысканий'),
  it('people', 'week', 'RDM с заместителями'),
  it('people', 'week', 'Проведение кофе-брейков с новенькими'),
  it('people', 'month', 'Собрание менеджеров'),
  it('people', 'month', 'Проверка проведения оценок рабочих показателей в ресторане'),
  it('people', 'month', 'Встречи по развитию с менеджерами, подготовка к классам, контроль удалённого тестирования'),
  it('people', 'month', 'Ежемесячные встречи с заместителями по целям'),
  it('people', 'month', 'План CAT/MAT'),
  it('people', 'month', 'Анализ текучести, анализ плана мероприятий по привлечению анкет'),
  it('people', 'month', 'Аудит по безопасности'),
  it('people', 'month', 'МЕ команды'),
  it('people', 'quarter', 'Собрание подразделений (MR, DLK, DLV, NT, ЛГ)', { short: 'Собрание подразделений', byMonth: UNITS }),
  it('people', 'quarter', 'Анализ и коррекция стаффинг-плана'),
  it('people', 'half', 'Rap Session с работниками'),
  it('people', 'half', 'Проверка Т-фактор'),
  it('people', 'half', 'Фокус-группы'),
  it('people', 'half', 'Подготовка и проведение оценок рабочих показателей заместителям'),
  it('people', 'year', 'Подготовка и проведение мероприятий для работников'),
  it('people', 'year', 'Проверка Ч-фактор'),
  it('people', 'year', 'График отпусков на следующий год'),
  it('people', 'year', 'Опрос мнения, план действий по итогам опроса мнения'),
  it('people', 'year', 'Собрание работников'),

  // ---------- ТОВАРООБОРОТ
  it('turnover', 'day', 'Анализ почасового отчёта'),
  it('turnover', 'week', 'Проверка и корректировка планируемого Т/О и часов'),
  it('turnover', 'week', 'Анализ результатов работы концепций ресторана (Delivery)'),
  it('turnover', 'month', 'Планирование Т/О'),
  it('turnover', 'month', 'Новые программы: продукты, учебные материалы, реклама'),
  it('turnover', 'quarter', 'Коррекция VLH таблиц и схемы расстановки работников'),

  // ---------- ПРИБЫЛЬ
  it('profit', 'day', 'Проверка и подписание всех необходимых документов по кассовой комнате'),
  it('profit', 'day', 'Проверка ежедневного стат-отчёта'),
  it('profit', 'day', 'Проверка отсутствия открытых заказов'),
  it('profit', 'day', 'Проверка DFS'),
  it('profit', 'week', 'Проверка недельного стат-отчёта'),
  it('profit', 'week', 'Проверка рабочего времени в ТТ (2 раза в месяц)'),
  it('profit', 'week', 'Пересчёт наличности сейфа'),
  it('profit', 'week', 'Анализ затрат за текущий месяц'),
  it('profit', 'month', 'МЕ ресторана'),
  it('profit', 'month', 'Анализ P&L и Expenses'),
  it('profit', 'month', 'Планирование P&L на следующий месяц'),
  it('profit', 'quarter', 'MR audit'),
  it('profit', 'year', 'Инвентаризация основных средств / списание основных средств'),

  // ---------- АДМИНИСТРИРОВАНИЕ
  it('admin', 'day', 'Обработка текущих счетов'),
  it('admin', 'day', 'Работа с e-mail'),
  it('admin', 'day', 'Лист To-do'),
  it('admin', 'week', 'Еженедельные новости. Выполнение всех актуальных пунктов'),
  it('admin', 'month', 'Анализ результатов работы ресторана за месяц, цели на следующий период'),
  it('admin', 'month', 'Расписание директора'),
  it('admin', 'month', 'Расписание менеджеров'),
  it('admin', 'month', 'Закрытие месяца по кадрам, проверка отчётов HR'),
  it('admin', 'quarter', 'Собрание директоров'),
  it('admin', 'half', 'Презентация BAS'),
  it('admin', 'year', 'Обновление договоров'),
]