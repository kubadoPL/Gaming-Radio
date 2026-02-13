import os

# Set working directory to one level up from where bot.py is
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.join(script_dir, "..")
# os.chdir(parent_dir)  # Handled by launcher

from flask import Flask, jsonify, request
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import time
from flask_cors import CORS

from flask import Flask, jsonify, render_template_string
from flask_caching import Cache


app = Flask(__name__)
CORS(app)  # enable CORS globally

cache = Cache(app, config={"CACHE_TYPE": "simple"})


@app.route("/")
def home():
    return render_template_string(
        """
    <!doctype html>
    <html>
      <head><title>Simple Page</title></head>
      <body>
        <h1>It works! paste to link /get-sum to see how many users stream radio gaming!</h1>
      </body>
    </html>
    """
    )


import threading

# Global lock to ensure only one Selenium instance runs at a time (saves memory)
scraping_lock = threading.Lock()


@app.route("/get-sum", methods=["GET"])
@cache.cached(timeout=300, query_string=True)
def get_sum():
    station = request.args.get("station")
    if not station:
        return jsonify({"error": "Missing station parameter"}), 400

    with scraping_lock:
        return _perform_scrape(station)


def _perform_scrape(station):
    # Login credentials
    EMAIL = os.environ.get("ZENOFM_EMAIL_" + station.upper())
    PASSWORD = os.environ.get("ZENOFM_PASSWORD_" + station.upper())

    if not EMAIL or not PASSWORD:
        return jsonify({"error": "Missing credentials for station: " + station}), 400

    # Optional: headless mode for production use
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-setuid-sandbox")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-logging")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--no-zygote")
    options.add_argument("--single-process")  # Crucial for low memory
    options.add_argument("--memory-pressure-off")
    options.add_argument("--blink-settings=imagesEnabled=false")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    # Don't specify path — chromedriver is in PATH
    service = Service()  # Auto-resolves chromedriver from PATH

    driver = None
    total_sum = 0

    try:
        print(f"[DEBUG] [{station}] Initializing Chrome driver (Locked)...")
        driver = webdriver.Chrome(service=service, options=options)

        # Log version info
        try:
            print(f"[DEBUG] Browser: {driver.capabilities['browserVersion']}")
            print(
                f"[DEBUG] ChromeDriver: {driver.capabilities['chrome']['chromedriverVersion'].split(' ')[0]}"
            )
        except:
            pass

        driver.set_page_load_timeout(45)

        print(f"[DEBUG] Navigating to login page...")
        driver.get("https://tools.zeno.fm/login")

        print(f"[DEBUG] Waiting for login form (max 15s)...")
        # Increase patience and add a small sleep to let static assets settle
        WebDriverWait(driver, 15).until(
            EC.visibility_of_element_located((By.ID, "username"))
        )
        time.sleep(1)

        def safe_send_keys(element_id, text):
            for _ in range(3):
                try:
                    el = driver.find_element(By.ID, element_id)
                    el.clear()
                    el.send_keys(text)
                    return
                except Exception as ex:
                    print(
                        f"[DEBUG] Retrying send_keys for {element_id} due to {type(ex).__name__}"
                    )
                    time.sleep(1)
            driver.find_element(By.ID, element_id).send_keys(text)  # Final attempt

        print(f"[DEBUG] Entering credentials for {EMAIL}...")
        safe_send_keys("username", EMAIL)
        safe_send_keys("password", PASSWORD)

        time.sleep(0.5)
        print(f"[DEBUG] Clicking login button...")
        try:
            driver.find_element(By.ID, "kc-login").click()
        except Exception:
            # Fallback if button becomes stale or hidden
            submit_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "kc-login"))
            )
            submit_btn.click()

        print(f"[DEBUG] Waiting for redirection to /accounts (max 30s)...")
        # Redirection can be slow on low-memory environments
        WebDriverWait(driver, 30).until(EC.url_contains("/accounts"))

        current_url = driver.current_url
        print(f"[DEBUG] Current URL after login: {current_url}")
        print(f"[DEBUG] Current URL: {current_url}")

        index = current_url.find("accounts/")
        if index == -1:
            print(f"[ERROR] Could not find 'accounts/' in URL: {current_url}")
            return (
                jsonify(
                    {
                        "error": f"Login failed or redirected to unexpected URL: {current_url}"
                    }
                ),
                500,
            )

        accounts_part = current_url[index:]
        analytics_url = f"https://tools.zeno.fm/{accounts_part}analytics/live"
        print(f"[DEBUG] Navigating to analytics: {analytics_url}")

        driver.get(analytics_url)

        print(f"[DEBUG] Waiting for analytics data to load (3s sleep)...")
        time.sleep(3)  # Wait for the page to load completely

        print(f"[DEBUG] Parsing page source with BeautifulSoup...")
        soup = BeautifulSoup(driver.page_source, "html.parser")
        tds = soup.find_all("td", class_="td vs-table--td")

        print(f"[DEBUG] Found {len(tds)} table cells.")

        i = 0
        while i < len(tds) - 1:
            country_td = tds[i].find("span")
            number_td = tds[i + 1].find("span")

            if country_td and number_td:
                number_text = number_td.get_text(strip=True)
                if number_text.isdigit():
                    total_sum += int(number_text)
            i += 2

        print(f"[DEBUG] Successfully calculated total sum: {total_sum}")

    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] Exception occurred: {error_msg}")
        # Capture current URL for debugging
        last_url = "Unknown"
        try:
            if driver:
                last_url = driver.current_url
        except:
            pass
        return jsonify({"error": error_msg, "last_url": last_url}), 500

    finally:
        if driver:
            print(f"[DEBUG] Quitting driver...")
            driver.quit()

    return jsonify({"total_sum": total_sum})


def run_api():
    port = int(os.environ.get("PORT", 80))  # Get the port from environment variable
    print(f"[INFO] Starting API server on port {port}...")
    app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    run_api()
