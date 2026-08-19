import pandas as pd
import requests
import json
import time
import math

SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0'
SHEET_NAME = 'Hoardings_Master'
GOOGLE_SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={SHEET_NAME}"
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec'

def clean_value(val):
    if pd.isna(val) or (isinstance(val, float) and math.isnan(val)):
        return ""
    return str(val)

def run():
    print("Reading Desktop Excel...")
    df_excel = pd.read_excel('C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx')
    
    print("Reading Live Google Sheet...")
    df_live = pd.read_csv(GOOGLE_SHEET_URL)
    
    df_excel.columns = [str(c).strip() for c in df_excel.columns]
    
    KEEP_COLS = ['STATUS', 'ImageURL', 'BookedBy', 'BookingStart', 'BookingEnd', '_SiteID', '_RowVersion', '_UpdatedAt', '_DeletedAt', '_LastOperationID']
    
    for col in KEEP_COLS:
        if col not in df_live.columns:
            df_live[col] = ''
            
    df_live_keep = df_live[KEEP_COLS].copy()
    
    min_len = min(len(df_excel), len(df_live_keep))
    
    df_merged = pd.concat([df_excel.iloc[:min_len], df_live_keep.iloc[:min_len]], axis=1)
    
    headers = df_merged.columns.tolist()
    rows = []
    for row in df_merged.values.tolist():
        rows.append([clean_value(x) for x in row])
    
    print(f"Prepared {len(rows)} rows.")
    
    print("Logging into Apps Script...")
    req_id = 'auth-' + str(int(time.time()*1000))
    requests.post(APPS_SCRIPT_URL, headers={'Content-Type': 'text/plain'}, json={
        'action': 'login', 'adminId': 'admin', 'password': 'admin1234', 'requestId': req_id
    })
    
    session_token = None
    for _ in range(15):
        try:
            res = requests.get(f"{APPS_SCRIPT_URL}?action=loginStatus&requestId={req_id}&_t={int(time.time()*1000)}").json()
            if res.get('status') == 'AUTHENTICATED':
                session_token = res.get('sessionToken')
                break
        except Exception:
            pass
        time.sleep(1)
        
    if not session_token:
        raise Exception("Login failed")
        
    print("Uploading to Google Sheets...")
    op_id = 'replace-' + str(int(time.time()*1000))
    res = requests.post(APPS_SCRIPT_URL, headers={'Content-Type': 'text/plain'}, json={
        'action': 'submitOperation',
        'sessionToken': session_token,
        'operation': {
            'operationId': op_id,
            'type': 'saveSheetGrid',
            'payload': {
                'sheetName': SHEET_NAME,
                'headers': headers,
                'rows': rows
            }
        }
    })
    print("Upload request sent!", res.text)
    
run()
