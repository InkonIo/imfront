/** Регламенты по дням недели. Индекс 0 = понедельник … 6 = воскресенье. null — в этот день ничего нет. */
export const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'] as const
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

export interface InsideDay {
  morning: string | null
  evening: string | null
}

/** Регламенты для Инсайда: что мыть утром и вечером. */
export const INSIDE: InsideDay[] = [
  { morning: 'Серые бадейки', evening: 'Стеллажи для булочек (3 шт)' },
  { morning: 'Красные лотки (10 шт)', evening: 'Красные лотки (30 шт)' },
  { morning: 'Кухонные бадейки от клея', evening: 'Куриные и рыбные лотки' },
  { morning: null, evening: 'Мясные лотки' },
  { morning: null, evening: null },
  { morning: null, evening: null },
  { morning: 'Ножки всех стеллажей прилавка', evening: 'Контейнер фри, топпинги' },
]

/** Регламенты для ДЛК: одно задание на день. */
export const DLK: (string | null)[] = ['Фризер', 'Кулер', 'Сухой', 'Мультиплекс', null, null, 'Сухой']

/** Понедельник = 0 (в JS воскресенье = 0, поэтому сдвигаем). */
export const todayIndex = (d = new Date()) => (d.getDay() + 6) % 7