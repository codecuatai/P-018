import React from 'react';
import { Image, View, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { theme } from '../../theme';

interface BrandLogoProps {
  size?: number;
  rounded?: boolean;
  glow?: boolean;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
}

export function BrandLogo({
  size = 36,
  rounded = true,
  glow = false,
  style,
  imageStyle,
}: BrandLogoProps) {
  const borderRadius = rounded ? size * 0.28 : 0;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
        glow && styles.glowEffect,
        style,
      ]}
    >
      <Image
        source={require('../../../assets/icon.png')}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius,
          },
          imageStyle,
        ]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  glowEffect: {
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
