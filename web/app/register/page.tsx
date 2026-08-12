"use client";
import type { Metadata } from "next";
import Link from "next/link";
import { useState } from "react";
import { HarvestIcon } from "../components/HarvestIcon";
import { SiteNavigation } from "../components/SiteNavigation";
import styles from "./register.module.css";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    phone_number: "",
    email: "",
    region: "",
    township: "",
    village: "",
    grid_id: "mm_1844_424",
    main_crops: ["crop_suitability_monsoon_rice"],
    preferred_language: "my",
    sms_consent: true,
    email_consent: false,
    ivr_consent: false,
    consent: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError(null);
    if (!formData.consent) {
      setError("You must accept the terms and conditions.");
      return;
    }
    setLoading(true);

    const payload = {
      username: formData.username,
      phone_number: formData.phone_number,
      email: formData.email || undefined,
      location: {
        region: formData.region,
        township: formData.township?.trim() || undefined,
        village: formData.village?.trim() || undefined,
        grid_id: formData.grid_id,
      },
      main_crops: formData.main_crops,
      preferred_language: formData.preferred_language,
      communication: {
        sms: formData.sms_consent,
        email: formData.email_consent,
        ivr: formData.ivr_consent,
      },
      consent: formData.consent,
    };

    try {
      const response = await fetch("/api/v1/farmers/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("ယခင်က စာရင်းသွင်းပြီးဖြစ်သောကြောင့် ထပ်မံစာရင်းသွင်း၍ မရတော့ပါ။");
        }
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Registration failed");
      }

      const result = await response.json();
      localStorage.setItem("currentUser", JSON.stringify(result.data));
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.pageNav}>
        <SiteNavigation />
      </div>
      <section className={styles.registerPanel} aria-labelledby="register-title">
        <Link href="/" className={styles.brandLink} aria-label="Go to home">
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
            <h1 id="register-title">Farmer Registration</h1>
            <p>Join us and get agricultural alerts directly via SMS/Email</p>
          </header>

          <form className={styles.form} onSubmit={handleSubmit}>
            {error && <div className={styles.errorAlert} style={{color: 'red', marginBottom: '10px'}}>{error}</div>}

            <div className={styles.fieldGroup}>
              <label htmlFor="username">Name</label>
              <div className={styles.control}>
                <HarvestIcon name="user" size={24} strokeWidth={1.65} />
                <input
                  id="username"
                  name="username"
                  placeholder="e.g. Ko Aung"
                  type="text"
                  required
                  value={formData.username}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="phone_number">Phone Number</label>
              <div className={styles.control}>
                <HarvestIcon name="phone" size={24} strokeWidth={1.65} />
                <input
                  id="phone_number"
                  name="phone_number"
                  placeholder="09..."
                  type="tel"
                  required
                  value={formData.phone_number}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="email">Email (Optional)</label>
              <div className={styles.control}>
                <HarvestIcon name="settings" size={24} strokeWidth={1.65} />
                <input
                  id="email"
                  name="email"
                  placeholder="your@email.com"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="region">Region</label>
              <div className={`${styles.control} ${styles.selectControl}`}>
                <HarvestIcon name="pin" size={24} strokeWidth={1.65} />
                <select id="region" name="region" value={formData.region} onChange={handleChange} required>
                  <option disabled value="">Select Region</option>
                  <option value="ayeyarwady">Ayeyarwady</option>
                  <option value="bago">Bago</option>
                  <option value="magway">Magway</option>
                  <option value="mandalay">Mandalay</option>
                  <option value="sagaing">Sagaing</option>
                  <option value="yangon">Yangon</option>
                </select>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="grid_id">Grid ID (Demo)</label>
              <div className={styles.control}>
                <HarvestIcon name="pin" size={24} strokeWidth={1.65} />
                <input
                  id="grid_id"
                  name="grid_id"
                  type="text"
                  required
                  value={formData.grid_id}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" name="sms_consent" checked={formData.sms_consent} onChange={handleChange} />
                Receive SMS Alerts (Primary)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" name="email_consent" checked={formData.email_consent} onChange={handleChange} />
                Receive Email Alerts
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" name="ivr_consent" checked={formData.ivr_consent} onChange={handleChange} />
                Enable IVR Voice Alerts (Fallback)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                <input type="checkbox" name="consent" checked={formData.consent} onChange={handleChange} required />
                I agree to register my farm location for alerts.
              </label>
            </div>

            <button className={styles.submitButton} type="submit" disabled={loading} style={{ marginTop: '20px' }}>
              {loading ? "Registering..." : "Register"}
            </button>
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <Link href="/" style={{ 
                display: 'inline-block', 
                padding: '10px 20px', 
                backgroundColor: '#f1f5f9', 
                color: '#475569', 
                borderRadius: '8px', 
                textDecoration: 'none', 
                fontWeight: '500',
                width: '100%',
                border: '1px solid #cbd5e1'
              }}>
                ပင်မစာမျက်နှာသို့ ပြန်သွားရန် (Home Page)
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );

}
