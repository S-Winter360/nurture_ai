rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper to check if request is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper to verify user owns the existing document
    function isOwner(resource) {
      return isAuthenticated() && resource.data.owner_uid == request.auth.uid;
    }

    // Helper to verify user owns the incoming new document
    function isNewOwner(request) {
      return isAuthenticated() && request.resource.data.owner_uid == request.auth.uid;
    }

    // --- USERS COLLECTION ---
    match /users/{userId} {
      allow create: if isNewOwner(request);
      allow read: if isAuthenticated() && (resource.data.owner_uid == request.auth.uid || resource.data.firebase_uid == request.auth.uid);
      allow update: if isOwner(resource) && isNewOwner(request);
      allow delete: if isOwner(resource);
    }

    // --- SYNCHRONIZED HEALTH COLLECTIONS (FLAT STRUCTURE) ---
    // Applies to: maternal_profiles, pregnancies, children, care_tasks, appointments, vaccinations, growth_records
    match /{collectionName}/{docId} {
      allow create: if isNewOwner(request);
      allow read: if isOwner(resource);
      allow update: if isOwner(resource) && isNewOwner(request); // Prevents owner_uid tampering
      allow delete: if isOwner(resource);
    }

    // --- STRICTLY LOCAL ENTITIES (BLOCK ALL CLOUD ACCESS IF ACCIDENTALLY PUSHED) ---
    match /reminders/{reminderId} {
      allow read, write: if false;
    }
    match /app_settings/{settingKey} {
      allow read, write: if false;
    }
  }
}