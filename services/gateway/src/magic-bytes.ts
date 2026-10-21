/**
 * Magic bytes validation for uploaded files.
 * Protects downstream Stirling-PDF from malformed, arbitrary, or malicious files (SEC-8).
 */

export interface MagicByteCheckResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
}

export function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46    // F
  );
}

export function isZipOrModernOffice(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function isLegacyOffice(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

export function isRtf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x7b && // {
    bytes[1] === 0x5c && // \
    bytes[2] === 0x72 && // r
    bytes[3] === 0x74    // t
  );
}

export function isImage(bytes: Uint8Array): boolean {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true; // PNG
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true; // JPEG
  }
  return false;
}

export function validateMagicBytes(tool: string, bytes: Uint8Array): MagicByteCheckResult {
  if (!bytes || bytes.length < 4) {
    return {
      valid: false,
      error: "File is too small or empty to verify magic bytes",
    };
  }

  if (tool === "ocr" || tool === "compress") {
    if (isPdf(bytes)) {
      return { valid: true, detectedType: "application/pdf" };
    }
    return {
      valid: false,
      error: `Tool '${tool}' requires a valid PDF file (expected %PDF magic bytes)`,
    };
  }

  if (tool === "office-to-pdf") {
    if (isPdf(bytes)) {
      return { valid: true, detectedType: "application/pdf" };
    }
    if (isZipOrModernOffice(bytes)) {
      return { valid: true, detectedType: "application/vnd.openxmlformats-officedocument" };
    }
    if (isLegacyOffice(bytes)) {
      return { valid: true, detectedType: "application/msword" };
    }
    if (isRtf(bytes)) {
      return { valid: true, detectedType: "application/rtf" };
    }
    if (isImage(bytes)) {
      return { valid: true, detectedType: "image/*" };
    }
    return {
      valid: false,
      error: "Tool 'office-to-pdf' requires a valid PDF, Office document (.docx/.xlsx/.pptx/.doc/.xls/.ppt), RTF, or image",
    };
  }

  return {
    valid: false,
    error: `Unknown tool '${tool}'`,
  };
}
