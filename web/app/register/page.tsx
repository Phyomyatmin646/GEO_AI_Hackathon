import type { Metadata } from "next";
import { HarvestIcon } from "../components/HarvestIcon";
import styles from "./register.module.css";

export const metadata: Metadata = {
  title: "Register | Myanmar Agriculture Intelligence",
  description: "Create your Myanmar Agriculture Intelligence account.",
};

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <section className={styles.registerPanel} aria-labelledby="register-title">
        <span
          aria-label="စိုက်ပျိုးမိတ်ဆွေ — Myanmar Agriculture Intelligence"
          className={styles.brandLogo}
          role="img"
        />

        <div className={styles.card}>
          <div className={styles.avatar} aria-hidden="true">
            <HarvestIcon name="user" size={54} strokeWidth={1.45} />
          </div>

          <header className={styles.heading}>
            <h1 id="register-title">Register</h1>
            <p>Join us and explore agriculture intelligence</p>
          </header>

          <form className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="register-name">Name</label>
              <div className={styles.control}>
                <HarvestIcon name="user" size={24} strokeWidth={1.65} />
                <input
                  autoComplete="name"
                  id="register-name"
                  name="name"
                  placeholder="Enter your full name"
                  type="text"
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="register-phone">Phone Number</label>
              <div className={styles.control}>
                <HarvestIcon name="phone" size={24} strokeWidth={1.65} />
                <input
                  autoComplete="tel"
                  id="register-phone"
                  inputMode="tel"
                  name="phone"
                  placeholder="Enter your phone number"
                  type="tel"
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="register-location">Location</label>
              <div className={`${styles.control} ${styles.selectControl}`}>
                <HarvestIcon name="pin" size={24} strokeWidth={1.65} />
                <select defaultValue="" id="register-location" name="location">
                  <option disabled value="">
                    Select your location
                  </option>
                  <option value="ayeyarwady">Ayeyarwady</option>
                  <option value="bago">Bago</option>
                  <option value="magway">Magway</option>
                  <option value="mandalay">Mandalay</option>
                  <option value="sagaing">Sagaing</option>
                  <option value="yangon">Yangon</option>
                </select>
                <HarvestIcon name="chevron" size={22} strokeWidth={2.25} />
              </div>
            </div>

            <button className={styles.submitButton} type="button">
              Register
            </button>
          </form>

          <div className={styles.divider} aria-hidden="true">
            <span />
            <b>or</b>
            <span />
          </div>

          <div className={styles.loginPrompt}>
            Already have an account? <span>Log in</span>
          </div>
        </div>
      </section>
    </main>
  );
}
