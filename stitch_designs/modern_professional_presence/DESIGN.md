---
name: Modern Professional Presence
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#44474e'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#75777f'
  outline-variant: '#c5c6cf'
  surface-tint: '#4b5e86'
  primary: '#001231'
  on-primary: '#ffffff'
  primary-container: '#11274c'
  on-primary-container: '#7b8fba'
  inverse-primary: '#b3c6f4'
  secondary: '#2e5f9f'
  on-secondary: '#ffffff'
  secondary-container: '#8bb8fd'
  on-secondary-container: '#0a4786'
  tertiary: '#001429'
  on-tertiary: '#ffffff'
  tertiary-container: '#00294b'
  on-tertiary-container: '#4c92db'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#b3c6f4'
  on-primary-fixed: '#021a3f'
  on-primary-fixed-variant: '#33466d'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a7c8ff'
  on-secondary-fixed: '#001b3b'
  on-secondary-fixed-variant: '#094785'
  tertiary-fixed: '#d2e4ff'
  tertiary-fixed-dim: '#9fcaff'
  on-tertiary-fixed: '#001d36'
  on-tertiary-fixed-variant: '#00497e'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  deep-navy: '#11274C'
  royal-blue: '#205493'
  sky-accent: '#4B92DB'
  ice-blue: '#D1E8FF'
  success-emerald: '#059669'
  warning-amber: '#D97706'
  error-crimson: '#DC2626'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.55'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 1.5rem
  margin-desktop: 2.5rem
  margin-mobile: 1rem
  stack-xs: 0.25rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
  stack-xl: 4rem
---

## Brand & Style

This design system is defined by a **Modern Professional** aesthetic, designed for institutional environments that demand authority, precision, and ease of use. It evolves the previous institutional presence into a more refined, high-contrast interface that balances corporate reliability with contemporary digital elegance.

The visual narrative centers on "Functional Sophistication." By utilizing generous whitespace, a restricted but deep color palette, and sharp typographic hierarchy, the UI evokes an emotional response of trust, clarity, and professional duty. The design style leans heavily into **Minimalism** with subtle **Corporate Modern** influences, ensuring that complex data remains legible and critical actions—such as identity verification—feel significant and secure.

## Colors

The color palette is anchored by a sophisticated hierarchy of blues extracted from the institutional identity. **Deep Navy** (#11274C) serves as the primary brand color, used for high-level navigation, primary buttons, and critical text to establish immediate authority. **Royal Blue** and **Sky Accent** provide secondary and tertiary support for interactive states and secondary information.

The interface defaults to a **Light Mode** execution to maximize the "clean and airy" professional feel. Surfaces leverage a layered neutral strategy: the primary background uses a crisp **Neutral Off-White** (#F8FAFC), while containers and cards use pure white to pop against the subtle background. Semantic colors (Emerald, Amber, Crimson) are applied with high saturation to ensure state changes are unmistakable against the cool-toned palette.

## Typography

**Inter** is the exclusive typeface for this design system, chosen for its exceptional legibility and systematic, utilitarian character. The type scale is designed to handle high-density information without feeling cluttered.

- **Headlines & Display:** Utilize bold and semi-bold weights with tighter letter-spacing to command attention and create a strong architectural foundation.
- **Body Text:** Optimized for long-form reading and data scanning with generous line heights.
- **Labels:** Small labels use increased letter-spacing and a medium-to-bold weight to remain legible even at 12px, providing clear metadata and table header identification.
- **Visual Hierarchy:** Contrast is achieved primarily through weight and color (Deep Navy for headings vs. Slate Grays for body) rather than excessive size variation.

## Layout & Spacing

This design system employs a **Fixed Grid** model for desktop, centering content within a 1280px container to maintain readability on wide-screen professional monitors. A 12-column grid is used with 24px (1.5rem) gutters to provide a rigid, organized structure.

Spacing follows a strict 8px (0.5rem) linear rhythm. "Stack" spacing is the primary tool for defining relationship density:
- **Tight (stack-sm):** For grouping labels with inputs or names with roles.
- **Standard (stack-md):** Between content blocks within a card.
- **Loose (stack-lg/xl):** Between major sections or page headers.

On mobile, the system shifts to a fluid single-column layout with 16px safe-area margins. Horizontal breathing room is prioritized to ensure the camera viewfinder and biometric interfaces feel unconfined.

## Elevation & Depth

Hierarchy is communicated through **Tonal Layers** and **Ambient Shadows** to maintain a modern, professional crispness.

- **Surface Layers:** The background is slightly tinted (`#F8FAFC`), while interactive components like cards and inputs are pure white (`#FFFFFF`). This creates a subtle natural elevation without relying on heavy shadows.
- **Shadow Profile:** Shadows are extremely diffused and low-opacity. A standard "Level 1" shadow uses a 10px blur with only 4% opacity (Black) to provide a soft "lift" for cards.
- **Interactive Depth:** Hover states on buttons and clickable cards should not increase shadow depth but rather use a subtle background color shift (e.g., Deep Navy to a slightly lighter variant).
- **Glassmorphism (Contextual):** Semi-transparent blurs (20px blur) are reserved for mobile navigation overlays and modal backdrops to maintain context while focusing the user.

## Shapes

The shape language is **Soft (0.25rem)**. This "Soft" setting applies a 4px radius to standard elements like buttons and inputs, and 8px (rounded-lg) to cards.

This precision-oriented approach avoids the playfulness of pill shapes while moving away from the harshness of sharp corners. It communicates a modern, tech-forward institution. Special components, like status chips or notification badges, may use a "Full" roundedness (pill) to distinguish them from structural UI elements like buttons.

## Components

### Buttons
- **Primary:** Deep Navy background with White text. Uses `rounded-default`.
- **Secondary:** White background with a 1px border in Sky Accent and Deep Navy text.
- **Ghost:** Transparent background with Royal Blue text, for low-priority actions.

### Cards
Cards are the primary container. They feature a pure white background, a 1px border in a very light gray (`#E2E8F0`), and the Level 1 Ambient Shadow. Headers within cards should have a subtle bottom border to separate metadata from the main content.

### Inputs & Forms
Inputs use a 1px border (`#CBD5E1`). On focus, they transition to a 1px Royal Blue border with a 3px soft blue outer glow (ring). Labels are always positioned above the input using `label-md` for maximum clarity.

### Data Lists
Lists are clean and unbordered, using subtle horizontal separators. Selection states are indicated by a 4px left-edge accent in Royal Blue and a very faint blue background tint.

### Status Chips
Pill-shaped indicators with low-saturation backgrounds and high-saturation text:
- **Verified:** Ice Blue background, Deep Navy text.
- **Active:** Emerald tint (10% opacity), Emerald text.
- **Pending:** Amber tint (10% opacity), Amber text.

### Professional Camera Viewfinder
A high-contrast component for identity verification. It uses a 1:1 square frame with a Royal Blue corner-bracket overlay. Instructions are displayed in a semi-transparent Deep Navy bar at the bottom of the viewfinder with White `label-md` text.