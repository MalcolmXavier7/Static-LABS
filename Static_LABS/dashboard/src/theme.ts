// Light = the daytime neighborhood. Dark = Batcave mode (PLAN 88 palette).
export interface Theme {
  dark: boolean;
  pageBg: string;
  headerBg: string;
  border: string;
  text: string;
  heading: string;
  subtext: string;
  cardBg: string;
  cardBorder: string;
  cardBorderHover: string;
  cardGlow: string;
  pillBg: string;
  pillBorder: string;
  accent: string;
  accentText: string;
  panelBg: string;
  logBg: string;
  inputBg: string;
  divider: string;
}

export function getTheme(dark: boolean): Theme {
  if (!dark) {
    return {
      dark,
      pageBg: `
        radial-gradient(600px 420px at 12% 8%, rgba(74,144,184,0.16), transparent),
        radial-gradient(520px 380px at 88% 4%, rgba(245,200,0,0.13), transparent),
        radial-gradient(760px 540px at 55% 85%, rgba(30,174,219,0.11), transparent),
        linear-gradient(180deg, #ffffff 0%, #f5f7fa 100%)
      `,
      headerBg: 'rgba(255,255,255,0.6)',
      border: 'rgba(0,0,0,0.06)',
      text: '#1f1f1f',
      heading: '#000000',
      subtext: '#6b6b6b',
      cardBg: 'rgba(255,255,255,0.55)',
      cardBorder: 'rgba(255,255,255,0.85)',
      cardBorderHover: '#4A90B8',
      cardGlow: 'rgba(74,144,184,0.25)',
      pillBg: 'rgba(255,255,255,0.7)',
      pillBorder: 'rgba(0,0,0,0.06)',
      accent: '#4A90B8',
      accentText: '#0068bd',
      panelBg: 'rgba(255,255,255,0.94)',
      logBg: '#0C1120',
      inputBg: '#ffffff',
      divider: 'rgba(0,0,0,0.08)',
    };
  }
  return {
    dark,
    pageBg: `
      radial-gradient(700px 480px at 50% 0%, rgba(31,78,216,0.14), transparent),
      radial-gradient(520px 380px at 88% 90%, rgba(30,174,219,0.08), transparent),
      linear-gradient(180deg, #050810 0%, #0C1120 100%)
    `,
    headerBg: 'rgba(5,8,16,0.7)',
    border: '#1E2D45',
    text: '#e8edf5',
    heading: '#ffffff',
    subtext: '#8b98ad',
    cardBg: 'rgba(17,24,39,0.78)',
    cardBorder: '#1E2D45',
    cardBorderHover: '#1F4ED8',
    cardGlow: 'rgba(31,78,216,0.35)',
    pillBg: 'rgba(12,17,32,0.75)',
    pillBorder: '#1E2D45',
    accent: '#1F4ED8',
    accentText: '#5B8DEF',
    panelBg: 'rgba(12,17,32,0.97)',
    logBg: '#050810',
    inputBg: '#111827',
    divider: '#1E2D45',
  };
}
