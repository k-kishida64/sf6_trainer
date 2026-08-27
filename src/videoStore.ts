export type StoredVideo = {
  id: string
  label: string
  blob: Blob
}

const databaseName = 'sf6-trainer'
const storeName = 'videos'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDBを開けませんでした'))
  })
}

export async function getStoredVideos(): Promise<StoredVideo[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => {
      database.close()
      resolve(request.result as StoredVideo[])
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('動画一覧を読み込めませんでした'))
    }
  })
}

export async function saveStoredVideo(video: StoredVideo): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(video)
    request.onsuccess = () => {
      database.close()
      resolve()
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('動画を保存できませんでした'))
    }
  })
}

export async function renameStoredVideo(id: string, label: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName)
    const request = store.get(id)
    request.onsuccess = () => {
      const video = request.result as StoredVideo | undefined
      if (!video) {
        database.close()
        reject(new Error('動画が見つかりませんでした'))
        return
      }
      const updateRequest = store.put({ ...video, label })
      updateRequest.onsuccess = () => {
        database.close()
        resolve()
      }
      updateRequest.onerror = () => {
        database.close()
        reject(updateRequest.error ?? new Error('動画名を変更できませんでした'))
      }
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('動画名を変更できませんでした'))
    }
  })
}

export async function removeStoredVideo(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id)
    request.onsuccess = () => {
      database.close()
      resolve()
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('動画を削除できませんでした'))
    }
  })
}
