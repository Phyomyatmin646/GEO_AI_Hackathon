"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { HarvestIcon } from "../components/HarvestIcon";
import { SiteNavigation } from "../components/SiteNavigation";
import { useLanguage } from "../lib/i18n";
import styles from "./register.module.css";

type RegistrationFields = {
  username: string;
  phone: string;
  location: string;
  email: string;
};

type RegistrationField = keyof RegistrationFields;
type FieldErrors = Partial<Record<RegistrationField, string>>;
type SubmitState = "idle" | "pending" | "success" | "conflict" | "unavailable" | "error";

type RegisteredUser = {
  id: string;
  username: string;
  phone: string;
  location: string;
  email: string | null;
  created_at: string;
};

const INITIAL_FIELDS: RegistrationFields = {
  username: "",
  phone: "",
  location: "",
  email: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registeredUser(value: unknown): RegisteredUser | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const user = value.user;
  if (
    typeof user.id !== "string" ||
    typeof user.username !== "string" ||
    typeof user.phone !== "string" ||
    typeof user.location !== "string" ||
    user.email !== null && typeof user.email !== "string" ||
    typeof user.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    location: user.location,
    email: user.email,
    created_at: user.created_at,
  };
}

function responseErrorCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  return typeof value.error.code === "string" ? value.error.code : null;
}

export function RegisterExperience() {
  const { lang, setLang } = useLanguage();
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [createdUser, setCreatedUser] = useState<RegisteredUser | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const copy = lang === "my"
    ? {
        title: "Profile ဖွင့်ရန်",
        subtitle: "စိုက်ပျိုးရေးအချက်အလက်ဝန်ဆောင်မှုကို အသုံးပြုရန် profile ဖန်တီးပါ",
        username: "အသုံးပြုသူအမည်",
        usernamePlaceholder: "ဥပမာ farmer_01",
        phone: "ဖုန်းနံပါတ်",
        phonePlaceholder: "ဥပမာ 09123456789",
        location: "ဒေသ",
        locationPlaceholder: "သင့်ဒေသကို ရွေးပါ",
        email: "Email (မထည့်လည်းရသည်)",
        emailPlaceholder: "farmer@example.com",
        submit: "Profile ဖွင့်မည်",
        pending: "ဖန်တီးနေသည်…",
        success: "Profile ဖန်တီးပြီးပါပြီ",
        successDetail: "Password သို့မဟုတ် login session မထုတ်ပေးပါ။ သင့် profile ကိုသာ သိမ်းထားပါသည်။",
        conflict: "ဤအချက်အလက်များဖြင့် profile ရှိပြီးသားဖြစ်သည်။",
        unavailable: "Registration service ကို ယာယီအသုံးမပြုနိုင်ပါ။ နောက်မှပြန်စမ်းပါ။",
        error: "Profile မဖန်တီးနိုင်ပါ။ အချက်အလက်များစစ်ပြီး ပြန်စမ်းပါ။",
        boundary: "ဤလုပ်ဆောင်ချက်သည် profile သာဖန်တီးပြီး password၊ login token သို့မဟုတ် verification မပေးပါ။",
        language: "English",
        validation: {
          username: "အက္ခရာ/ဂဏန်း/underscore ပါသော ၃–၅၀ လုံးအမည် ထည့်ပါ။",
          phone: "မှန်ကန်သော Myanmar local သို့မဟုတ် international ဖုန်းနံပါတ် ထည့်ပါ။",
          location: "ဒေသရွေးပါ။",
          email: "မှန်ကန်သော email ထည့်ပါ သို့မဟုတ် အလွတ်ထားပါ။",
        },
      }
    : {
        title: "Create a profile",
        subtitle: "Register a profile to use Myanmar Agriculture Intelligence",
        username: "Username",
        usernamePlaceholder: "For example, farmer_01",
        phone: "Phone number",
        phonePlaceholder: "For example, 09123456789",
        location: "Location",
        locationPlaceholder: "Select your location",
        email: "Email (optional)",
        emailPlaceholder: "farmer@example.com",
        submit: "Create profile",
        pending: "Creating…",
        success: "Profile created",
        successDetail: "No password or login session is issued. Only your profile has been saved.",
        conflict: "A profile with these registration details already exists.",
        unavailable: "The registration service is temporarily unavailable. Please try again later.",
        error: "The profile could not be created. Check the fields and try again.",
        boundary: "This creates a profile only. It does not issue a password, login token, or verification state.",
        language: "Myanmar",
        validation: {
          username: "Use 3–50 letters, numbers, underscores, periods, or hyphens.",
          phone: "Enter a valid Myanmar local or international phone number.",
          location: "Select a location.",
          email: "Enter a valid email address or leave it blank.",
        },
      };

  function updateField(field: RegistrationField, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (submitState !== "pending") setSubmitState("idle");
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const normalizedUsername = fields.username.trim().normalize("NFC");
    const phone = fields.phone.trim().replace(/[\s-]/g, "");
    const normalizedPhone = phone.startsWith("0") ? `+95${phone.slice(1)}` : phone;
    if (
      [...normalizedUsername].length < 3 ||
      [...normalizedUsername].length > 50 ||
      !/^[\p{L}\p{M}\p{N}_.-]+$/u.test(normalizedUsername)
    ) {
      errors.username = copy.validation.username;
    }
    if (
      phone.startsWith("00") ||
      phone.startsWith("+950") ||
      !/^\+[1-9]\d{6,14}$/.test(normalizedPhone)
    ) {
      errors.phone = copy.validation.phone;
    }
    if (!fields.location) errors.location = copy.validation.location;
    if (
      fields.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())
    ) {
      errors.email = copy.validation.email;
    }
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "pending") return;
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitState("error");
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setSubmitState("pending");
    setCreatedUser(null);
    setRequestId(null);
    try {
      const response = await fetch("/api/v1/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fields.username.trim(),
          phone: fields.phone.trim(),
          location: fields.location,
          ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as unknown;
      const responseRequestId = response.headers.get("x-request-id");
      if (responseRequestId) setRequestId(responseRequestId);
      if (response.status === 409) {
        setSubmitState("conflict");
        return;
      }
      if ([503, 504].includes(response.status)) {
        setSubmitState("unavailable");
        return;
      }
      if (!response.ok) {
        setSubmitState(responseErrorCode(payload) === "VALIDATION_ERROR" ? "error" : "unavailable");
        return;
      }
      const user = registeredUser(payload);
      if (!user) {
        setSubmitState("unavailable");
        return;
      }
      setCreatedUser(user);
      setSubmitState("success");
    } catch {
      if (controller.signal.aborted) return;
      setSubmitState("unavailable");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  const statusMessage = {
    idle: null,
    pending: null,
    success: copy.successDetail,
    conflict: copy.conflict,
    unavailable: copy.unavailable,
    error: Object.keys(fieldErrors).length === 0 ? copy.error : null,
  }[submitState];

  return (
    <main className={styles.page}>
      <div className={styles.pageNav}>
        <button
          type="button"
          className={styles.languageButton}
          onClick={() => setLang(lang === "my" ? "en" : "my")}
          aria-label={lang === "my" ? "Switch to English" : "မြန်မာဘာသာသို့ ပြောင်းရန်"}
        >
          <HarvestIcon name="globe" size={17} /> {copy.language}
        </button>
        <SiteNavigation />
      </div>
      <section className={styles.registerPanel} aria-labelledby="register-title">
        <Link href="/" className={styles.brandLink} aria-label={lang === "my" ? "ပင်မစာမျက်နှာသို့" : "Go to home"}>
          <span
            aria-label="စိုက်ပျိုးမိတ်ဆွေ — Myanmar Agriculture Intelligence"
            className={styles.brandLogo}
            role="img"
          />
        </Link>

        <div className={styles.card}>
          <div className={styles.avatar} aria-hidden="true">
            <HarvestIcon name="user" size={54} strokeWidth={1.45} />
          </div>

          <header className={styles.heading}>
            <h1 id="register-title">{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </header>

          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.fieldGroup}>
              <label htmlFor="register-username">{copy.username}</label>
              <div className={`${styles.control} ${fieldErrors.username ? styles.invalidControl : ""}`}>
                <HarvestIcon name="user" size={24} strokeWidth={1.65} />
                <input
                  aria-describedby={fieldErrors.username ? "register-username-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.username)}
                  autoComplete="username"
                  id="register-username"
                  name="username"
                  onChange={(event) => updateField("username", event.target.value)}
                  placeholder={copy.usernamePlaceholder}
                  type="text"
                  value={fields.username}
                />
              </div>
              {fieldErrors.username && <small className={styles.fieldError} id="register-username-error">{fieldErrors.username}</small>}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="register-phone">{copy.phone}</label>
              <div className={`${styles.control} ${fieldErrors.phone ? styles.invalidControl : ""}`}>
                <HarvestIcon name="phone" size={24} strokeWidth={1.65} />
                <input
                  aria-describedby={fieldErrors.phone ? "register-phone-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  autoComplete="tel"
                  id="register-phone"
                  inputMode="tel"
                  name="phone"
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder={copy.phonePlaceholder}
                  type="tel"
                  value={fields.phone}
                />
              </div>
              {fieldErrors.phone && <small className={styles.fieldError} id="register-phone-error">{fieldErrors.phone}</small>}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="register-location">{copy.location}</label>
              <div className={`${styles.control} ${styles.selectControl} ${fieldErrors.location ? styles.invalidControl : ""}`}>
                <HarvestIcon name="pin" size={24} strokeWidth={1.65} />
                <select
                  aria-describedby={fieldErrors.location ? "register-location-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.location)}
                  id="register-location"
                  name="location"
                  onChange={(event) => updateField("location", event.target.value)}
                  value={fields.location}
                >
                  <option disabled value="">{copy.locationPlaceholder}</option>
                  <option value="Ayeyawaddy">Ayeyawaddy</option>
                  <option value="Bago">Bago</option>
                  <option value="Magway">Magway</option>
                  <option value="Mandalay">Mandalay</option>
                  <option value="Sagaing">Sagaing</option>
                  <option value="Yangon">Yangon</option>
                </select>
                <HarvestIcon name="chevron" size={22} strokeWidth={2.25} />
              </div>
              {fieldErrors.location && <small className={styles.fieldError} id="register-location-error">{fieldErrors.location}</small>}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="register-email">{copy.email}</label>
              <div className={`${styles.control} ${fieldErrors.email ? styles.invalidControl : ""}`}>
                <HarvestIcon name="info" size={24} strokeWidth={1.65} />
                <input
                  aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.email)}
                  autoComplete="email"
                  id="register-email"
                  inputMode="email"
                  name="email"
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  type="email"
                  value={fields.email}
                />
              </div>
              {fieldErrors.email && <small className={styles.fieldError} id="register-email-error">{fieldErrors.email}</small>}
            </div>

            <button className={styles.submitButton} disabled={submitState === "pending"} type="submit">
              {submitState === "pending" ? copy.pending : copy.submit}
            </button>
          </form>

          {(statusMessage || submitState === "success") && (
            <div
              className={`${styles.formStatus} ${submitState === "success" ? styles.successStatus : styles.errorStatus}`}
              role={submitState === "success" ? "status" : "alert"}
            >
              <strong>{submitState === "success" ? `${copy.success}: ${createdUser?.username ?? ""}` : statusMessage}</strong>
              {submitState === "success" && <span>{copy.successDetail}</span>}
              {requestId && <small>Request ID: {requestId}</small>}
            </div>
          )}

          <div className={styles.divider} aria-hidden="true"><span /><b>•</b><span /></div>
          <div className={styles.loginPrompt}>{copy.boundary}</div>
        </div>
      </section>
    </main>
  );
}
