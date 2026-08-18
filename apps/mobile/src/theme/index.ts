export const theme = {
  colors: {
    // Rich, Modern Pearl & Slate Backgrounds (Not flat plain white)
    background: '#F4F7F9', // Off-white as requested
    backgroundSecondary: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceSubtle: '#F8FAFC',
    surfaceCard: '#FFFFFF',
    surfaceMuted: '#E2E8F0',
    surfaceHighlight: '#E0E7FF',
    
    // Text Hierarchy (Deep Charcoal Ink & Rich Slate)
    ink: '#0F172A',
    inkSecondary: '#1E293B',
    muted: '#64748B',
    mutedLight: '#94A3B8',
    line: '#E2E8F0',
    lineLight: '#F1F5F9',
    
    // Primary Brand (FinTech Blue)
    primary: '#0052FF',
    primaryDark: '#0040C5',
    primaryLight: '#E5EDFF',
    primaryGlow: 'rgba(0, 82, 255, 0.2)',
    primaryBorder: '#B3CCFF',
    
    // Status Accents
    success: '#059669',
    successBg: '#ECFDF5',
    successBorder: '#A7F3D0',
    
    warning: '#D97706',
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    
    danger: '#DC2626',
    dangerBg: '#FEF2F2',
    dangerBorder: '#FECACA',
    
    // Domain Palette: Rich Jewel Tones with Complementary Fills
    // 1. Chuyến xe (Cobalt Sapphire)
    ride: '#2563EB',
    rideDark: '#1D4ED8',
    rideBg: '#EFF6FF',
    rideCardBg: '#F0F7FF',
    rideBorder: '#BFDBFE',
    
    // 2. Đồ ăn (Sunset Flame & Golden Coral)
    food: '#EA580C',
    foodDark: '#C2410C',
    foodBg: '#FFF7ED',
    foodCardBg: '#FFF9F5',
    foodBorder: '#FED7AA',
    
    // 3. Nhà hàng (Emerald Jade)
    restaurant: '#059669',
    restaurantDark: '#047857',
    restaurantBg: '#ECFDF5',
    restaurantCardBg: '#F2FBF7',
    restaurantBorder: '#A7F3D0',
    
    // 4. Lịch khám (Royal Amethyst Orchid)
    healthcare: '#7C3AED',
    healthcareDark: '#6D28D9',
    healthcareBg: '#F5F3FF',
    healthcareCardBg: '#FAF7FF',
    healthcareBorder: '#DDD6FE',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
    full: 9999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    hero: 28,
  },
  shadow: {
    sm: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    md: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
      elevation: 6,
    },
  },
};
