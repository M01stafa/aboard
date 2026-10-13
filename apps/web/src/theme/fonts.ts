import localFont from 'next/font/local';

export const geist = localFont({
  src: './fonts/geist/geist-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-geist-sans',
});

export const alexandria = localFont({
  src: './fonts/alexandria/alexandria-arabic-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-alexandria',
  declarations: [{
    prop: 'unicode-range',
    value: 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFF',
  }],
});

export const fontClassNames = `${geist.variable} ${alexandria.variable}`;
