import type { ReactNode } from 'react';
import { ImageBackground, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

type SolarImageBackgroundProps = {
  children: ReactNode;
};

/** Solar panel photo + dark overlay (catalog / forecast screens only). */
export function SolarImageBackground({ children }: SolarImageBackgroundProps) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[styles.screen, { width, height }]}>
      <ImageBackground
        source={require('@/assets/images/home-solar-background.jpg')}
        style={[styles.background, { width, height }]}
        imageStyle={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={[styles.overlay, { width, height }]}>{children}</View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        minHeight: '100vh',
        width: '100%',
      },
    }),
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  backgroundImage: Platform.select({
    web: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    default: {},
  }),
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
