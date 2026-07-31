import requests
import base64

api_key = "Z6YwfqS1C6q5YKFoflwGa6g7hP3yri13"
api_secret = "1n4KsE2Z0uN3yi9yHMDy7BgEvZQFccu7"
url = "https://v3.smspoh.com/api/rest/send"

auth_str = f"{api_key}:{api_secret}"
encoded_auth = base64.b64encode(auth_str.encode()).decode()

headers1 = {
    "Authorization": f"Bearer {encoded_auth}",
    "Content-Type": "application/json"
}
headers2 = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

payload = {
    "sender": "SMSPoh",
    "to": "09123456789",
    "message": "test msg"
}

print("Test 1 (Base64):")
r1 = requests.post(url, headers=headers1, json=payload)
print(r1.status_code, r1.text)

print("\nTest 2 (API Key direct):")
r2 = requests.post(url, headers=headers2, json=payload)
print(r2.status_code, r2.text)
