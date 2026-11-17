"use client";

import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALE_NAMES, RATER_LOCALES, type RaterLocale } from "@/lib/i18n/rater";

/** Switches the rater form language; the choice is remembered on this device. */
export function LanguagePicker({ locale, label }: { locale: RaterLocale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      <label htmlFor="rater-lang" className="sr-only">
        {label}
      </label>
      <select
        id="rater-lang"
        data-testid="rater-language"
        value={locale}
        onChange={(e) => {
          document.cookie = `mirror_rater_lang=${e.target.value}; path=/r; max-age=31536000; samesite=lax`;
          router.replace(`${pathname}?lang=${e.target.value}`);
        }}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {RATER_LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
