# תמונות לאפליקציה

תיקייה זו מיועדת לתמונות שמופיעות במסכי האפליקציה (רקעים, איורים, אייקונים פנימיים).

אייקון האפליקציה, Splash ו-Favicon נשארים בתיקייה האב: `assets/images/` (מוגדרים ב-`app.json`).

## מבנה

| תיקייה | שימוש |
|--------|--------|
| `backgrounds/` | רקעים למסכים (למשל login, home) |
| `illustrations/` | איורים, onboarding, empty states |
| `icons/` | אייקונים פנימיים בממשק (לא אייקון החנות) |

## פורמטים מומלצים

- **רקעים:** JPG או WebP (קטן יותר), רזולוציה סביב 1080×1920 או יותר לפי צורך
- **איורים / אייקונים עם שקיפות:** PNG או WebP
- שמות קבצים באנגלית, עם מקפים: `login-solar-bg.jpg`

## שימוש בקוד (Expo / React Native)

```tsx
import { ImageBackground } from 'react-native';

const loginBackground = require('@/assets/images/app/backgrounds/login-solar-bg.jpg');

<ImageBackground source={loginBackground} style={{ flex: 1 }} resizeMode="cover">
  {/* תוכן המסך */}
</ImageBackground>
```

או עם `expo-image`:

```tsx
import { Image } from 'expo-image';

<Image
  source={require('@/assets/images/app/illustrations/welcome.png')}
  style={{ width: 200, height: 200 }}
  contentFit="contain"
/>
```

אחרי הוספת קבצים חדשים, ייתכן שיהיה צורך להפעיל מחדש את `npm start` כדי ש-Metro יזהה אותם.
