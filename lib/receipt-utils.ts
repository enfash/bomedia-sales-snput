/**
 * Receipt Generation Utilities
 * Handles validation, DOM readiness checks, and error handling for PDF generation
 */

import { UnifiedRecord } from "@/components/manage-sale-action";

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Validates a single record for completeness
 * Returns validation issues and warnings
 */
export function validateRecord(record: UnifiedRecord): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Critical fields that must be present
  if (!record.client || record.client.trim() === "") {
    issues.push("Missing client name");
  }

  if (!record.description || record.description.trim() === "") {
    issues.push("Missing job description");
  }

  if (record.amount === undefined || record.amount === null) {
    issues.push("Missing amount");
  }

  // Warning-level fields (non-critical but important)
  if (!record.salesId || record.salesId.trim() === "") {
    warnings.push("Missing sales ID - will generate fallback ID");
  }

  if (!record.date) {
    warnings.push("Missing date - will use current date");
  }

  if (!record.material || record.material.trim() === "") {
    warnings.push("Missing material information");
  }

  if (!record.contact || record.contact.trim() === "") {
    warnings.push("Missing contact information");
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Validates a batch of records (e.g., for grouped receipts)
 * Ensures all records in the group are valid or provides meaningful feedback
 */
export function validateRecordBatch(
  records: UnifiedRecord[]
): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!records || records.length === 0) {
    issues.push("No records provided for receipt generation");
    return { isValid: false, issues, warnings };
  }

  // Validate each record
  records.forEach((record, index) => {
    const validation = validateRecord(record);
    validation.issues.forEach((issue) => {
      issues.push(`Record ${index + 1}: ${issue}`);
    });
    validation.warnings.forEach((warning) => {
      warnings.push(`Record ${index + 1}: ${warning}`);
    });
  });

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Waits for DOM element to be fully rendered and ready for canvas capture
 * Uses MutationObserver to detect rendering completion
 * Includes timeout safety to prevent infinite waiting
 */
export function waitForDOMReady(
  element: HTMLElement,
  maxWaitMs: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!element) {
      reject(new Error("Invalid DOM element provided"));
      return;
    }

    // Check if element is already in the DOM
    if (!document.body.contains(element)) {
      reject(new Error("Element is not attached to the DOM"));
      return;
    }

    // Timeout safety - reject if not ready in time
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(
          `DOM ready timeout after ${maxWaitMs}ms - proceeding with capture anyway`
        )
      );
    }, maxWaitMs);

    // Monitor for DOM mutations (content changes)
    const observer = new MutationObserver((mutations) => {
      // Check if mutations are significant (not just style changes)
      const significantChanges = mutations.some((mutation) => {
        return (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        );
      });

      if (significantChanges) {
        // Reset the timeout after detecting changes
        clearTimeout(timeoutId);
        const newTimeoutId = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 300); // Wait 300ms after last mutation

        // Store the new timeout ID if we need it
        (observer as any).lastTimeoutId = newTimeoutId;
      }
    });

    // Start observing
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false, // Ignore attribute changes to reduce noise
    });

    // Fallback: resolve after a reasonable time even without mutations
    setTimeout(() => {
      if (observer) {
        observer.disconnect();
      }
      resolve();
    }, 800);
  });
}

/**
 * Provides sensible defaults for missing record fields
 * Used to ensure receipt template has all necessary data
 */
export function enrichRecord(record: UnifiedRecord): UnifiedRecord {
  return {
    ...record,
    client: record.client || "Client Name Not Provided",
    description: record.description || "Job Description Not Provided",
    amount: record.amount ?? 0,
    balance: record.balance ?? 0,
    date: record.date || new Date().toISOString(),
    contact: record.contact || "",
    material: record.material || "",
    salesId:
      record.salesId && record.salesId.trim() !== ""
        ? record.salesId
        : `INV-${String(record.rowIndex || Math.floor(Math.random() * 10000)).padStart(5, "0")}`,
  };
}

/**
 * Handles errors that occur during PDF generation
 * Provides user-friendly error messages
 */
export function getPDFErrorMessage(error: Error): string {
  const message = error.message || "";

  if (message.includes("html2canvas")) {
    return "Failed to capture receipt - the template may have rendering issues. Please try again.";
  }

  if (message.includes("jsPDF")) {
    return "Failed to generate PDF - please check the receipt data and try again.";
  }

  if (message.includes("Not attached to the DOM")) {
    return "Receipt is not ready - please wait and try again.";
  }

  if (message.includes("timeout")) {
    return "Receipt took too long to prepare - please try again.";
  }

  return "An error occurred while generating the receipt. Please try again.";
}
