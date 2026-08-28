import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL,
    uploadString 
} from 'firebase/storage';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    onSnapshot, 
    updateDoc, 
    query, 
    orderBy 
} from 'firebase/firestore';

// ─── PRIMARY FIREBASE PROJECT CONFIG ──────────────────────────────────────────
export const PRIMARY_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCp91xFVtPEVItnKjqNp8MR1gLaaUqKeeA",
    authDomain: "hoarding-89557.firebaseapp.com",
    projectId: "hoarding-89557",
    storageBucket: "hoarding-89557.firebasestorage.app",
    messagingSenderId: "674021640140",
    appId: "1:674021640140:web:9290576a6e0e486ab03f69",
    measurementId: "G-ZLK7XX952W"
};

// ─── OPTIONAL SECONDARY BACKUP FIREBASE CONFIG (Multi-Account Failover) ────────
// Jab pehla account full ho jaye, yahan doosre account ki config paste kar sakte hain
export const BACKUP_FIREBASE_CONFIG = null;

let primaryApp = null;
let primaryStorage = null;
let primaryDb = null;

let backupApp = null;
let backupStorage = null;
let backupDb = null;

export const initFirebase = () => {
    try {
        if (!getApps().length) {
            primaryApp = initializeApp(PRIMARY_FIREBASE_CONFIG, "primary");
        } else {
            try {
                primaryApp = getApp("primary");
            } catch {
                primaryApp = getApps()[0];
            }
        }
        primaryStorage = getStorage(primaryApp);
        primaryDb = getFirestore(primaryApp);

        if (BACKUP_FIREBASE_CONFIG) {
            try {
                backupApp = initializeApp(BACKUP_FIREBASE_CONFIG, "backup");
                backupStorage = getStorage(backupApp);
                backupDb = getFirestore(backupApp);
            } catch (e) {
                console.warn("[Firebase] Backup project init note:", e.message);
            }
        }

        console.log("🔥 Firebase initialized successfully (Project: hoarding-89557)");
        return { app: primaryApp, storage: primaryStorage, db: primaryDb };
    } catch (error) {
        console.error("🔥 [Firebase Init Error]:", error);
        return null;
    }
};

// Auto-initialize on module load
initFirebase();

/**
 * 🚀 Upload an image to Firebase Cloud Storage with Automatic Failover
 * @param {Blob|File} imageBlob - Raw or compressed image
 * @param {string} fileName - Destination path/name
 * @returns {Promise<string>} High-Speed CDN Download URL
 */
export const uploadImageToFirebase = async (imageBlob, fileName) => {
    if (!primaryStorage) initFirebase();
    if (!primaryStorage) throw new Error("Firebase Storage is not initialized.");

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `hoardings/${Date.now()}_${cleanName}`;

    // Attempt 1: Upload to Primary Firebase Storage
    try {
        const storageRef = ref(primaryStorage, storagePath);
        const metadata = { contentType: imageBlob.type || 'image/jpeg' };
        const snapshot = await uploadBytes(storageRef, imageBlob, metadata);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        return downloadUrl;
    } catch (primaryErr) {
        console.warn("⚠️ [Firebase] Primary storage upload failed, checking backup:", primaryErr.message);

        // Attempt 2: Auto-failover to Backup Firebase Storage if available
        if (backupStorage) {
            try {
                const backupRef = ref(backupStorage, storagePath);
                const metadata = { contentType: imageBlob.type || 'image/jpeg' };
                const snapshot = await uploadBytes(backupRef, imageBlob, metadata);
                const downloadUrl = await getDownloadURL(snapshot.ref);
                return downloadUrl;
            } catch (backupErr) {
                console.error("❌ [Firebase] Backup storage also failed:", backupErr);
            }
        }
        throw primaryErr;
    }
};

/**
 * ⚡ Real-time Live Listener for Hoarding Sites Collection
 * @param {Function} onData - Callback when any site updates in real-time
 * @returns {Function} Unsubscribe function to stop listening
 */
export const listenToHoardingsRealtime = (onData) => {
    if (!primaryDb) initFirebase();
    if (!primaryDb) return () => {};

    try {
        const hoardingsCol = collection(primaryDb, "hoardings");
        return onSnapshot(hoardingsCol, (snapshot) => {
            const list = [];
            snapshot.forEach((docSnap) => {
                list.push({ _id: docSnap.id, ...docSnap.data() });
            });
            if (list.length > 0) {
                onData(list);
            }
        }, (error) => {
            console.warn("⚠️ [Firebase Realtime Listener]:", error.message);
        });
    } catch (err) {
        console.warn("⚠️ [Firebase Realtime Init]:", err.message);
        return () => {};
    }
};

/**
 * 📝 Sync a single site to Firestore in real-time
 */
export const syncSiteToFirestore = async (siteId, siteData) => {
    if (!primaryDb) initFirebase();
    if (!primaryDb || !siteId) return;

    try {
        const docRef = doc(primaryDb, "hoardings", String(siteId));
        await setDoc(docRef, {
            ...siteData,
            _updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (err) {
        console.warn(`[Firestore Sync] Failed for ${siteId}:`, err.message);
    }
};
