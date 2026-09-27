/**
 * Single Source of Truth Projection Module for Responsive Face Verification
 * TAHAP 13.27 — Unified Screen & WebGL Coordinate Mapping
 */

export interface ProjectionParams {
    videoWidth: number;
    videoHeight: number;
    containerWidth: number;
    containerHeight: number;
    fitMode?: 'cover' | 'contain';
    isMirrored?: boolean;
}

export interface ProjectionResult {
    scale: number;
    renderedWidth: number;
    renderedHeight: number;
    cropX: number;
    cropY: number;
    containerWidth: number;
    containerHeight: number;
    isMirrored: boolean;
    isValid: boolean;
}

export interface ScreenPoint {
    screenX: number;
    screenY: number;
    screenZ: number;
}

/**
 * Calculates scaling, crop offsets, and bounds for object-fit projection.
 */
export function calculateProjection(
    params: ProjectionParams,
): ProjectionResult {
    const {
        videoWidth,
        videoHeight,
        containerWidth,
        containerHeight,
        fitMode = 'cover',
        isMirrored = true,
    } = params;

    if (
        !videoWidth ||
        !videoHeight ||
        !containerWidth ||
        !containerHeight ||
        videoWidth <= 0 ||
        videoHeight <= 0 ||
        containerWidth <= 0 ||
        containerHeight <= 0
    ) {
        return {
            scale: 1,
            renderedWidth: 0,
            renderedHeight: 0,
            cropX: 0,
            cropY: 0,
            containerWidth: 0,
            containerHeight: 0,
            isMirrored,
            isValid: false,
        };
    }

    const scale =
        fitMode === 'cover'
            ? Math.max(
                  containerWidth / videoWidth,
                  containerHeight / videoHeight,
              )
            : Math.min(
                  containerWidth / videoWidth,
                  containerHeight / videoHeight,
              );

    const renderedWidth = videoWidth * scale;
    const renderedHeight = videoHeight * scale;

    const cropX = (renderedWidth - containerWidth) / 2;
    const cropY = (renderedHeight - containerHeight) / 2;

    return {
        scale,
        renderedWidth,
        renderedHeight,
        cropX,
        cropY,
        containerWidth,
        containerHeight,
        isMirrored,
        isValid: true,
    };
}

/**
 * Projects a normalized landmark (0.0 to 1.0) into container pixel coordinates.
 * Exactly single-pass mirror application.
 */
export function projectNormalizedPoint(
    normalizedX: number,
    normalizedY: number,
    normalizedZ: number = 0,
    projection: ProjectionResult,
): ScreenPoint {
    if (!projection.isValid) {
        return { screenX: 0, screenY: 0, screenZ: 0 };
    }

    // Un-mirrored screen coordinates
    let screenX = normalizedX * projection.renderedWidth - projection.cropX;
    const screenY = normalizedY * projection.renderedHeight - projection.cropY;
    const screenZ = normalizedZ * projection.renderedWidth; // Scale Z proportionally to width

    // Apply mirror transform exactly ONCE
    if (projection.isMirrored) {
        screenX = projection.containerWidth - screenX;
    }

    return { screenX, screenY, screenZ };
}

/**
 * Projects a normalized point into Three.js OrthographicCamera space (centered at 0,0).
 */
export function projectToThreeOrthographic(
    normalizedX: number,
    normalizedY: number,
    normalizedZ: number = 0,
    projection: ProjectionResult,
): { cx: number; cy: number; cz: number } {
    const { screenX, screenY, screenZ } = projectNormalizedPoint(
        normalizedX,
        normalizedY,
        normalizedZ,
        projection,
    );

    // Convert container pixel (top-left origin) to Orthographic (center origin, Y-up)
    const cx = screenX - projection.containerWidth / 2;
    const cy = -(screenY - projection.containerHeight / 2);
    const cz = -screenZ;

    return { cx, cy, cz };
}
