export const color = {
  bg:        '#080B0C',
  bg2:       '#0C1113',
  surface:   '#11181B',
  surface2:  '#182226',
  hairline:  '#222F34',
  hairline2: '#2D3D43',
  tx:        '#EAF3F2',
  tx2:       '#9FB3B4',
  tx3:       '#5E7376',
  txOn:      '#04100E',
  signal:    '#00E6C7',
  signal2:   '#12A892',
  signal3:   '#0A6356',
  sos:       '#FF4438',
  sos2:      '#B22A22',
  warn:      '#FFB020',
  ok:        '#39D98A',
  android:   '#3DDC84',
  ios:       '#64C8FF',
} as const;

export const font = {
  display: 'SairaCondensed_700Bold',
  displayHeavy: 'SairaCondensed_800ExtraBold',
  body:    'HankenGrotesk_400Regular',
  bodyMed: 'HankenGrotesk_600SemiBold',
  mono:    'JetBrainsMono_500Medium',
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 40, xxl: 64 } as const;
export const radius = { input: 8, card: 14, panel: 22, pill: 999 } as const;

export type Color = typeof color;
export type Font = typeof font;
