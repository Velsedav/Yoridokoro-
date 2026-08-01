export interface ArtArchive { items: unknown[]; matches: unknown[] }

function openArtDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open('keystone');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
}

function readStore(db: IDBDatabase, name: string): Promise<unknown[]> {
  if(!db.objectStoreNames.contains(name))return Promise.resolve([])
  return new Promise((resolve,reject)=>{const request=db.transaction(name,'readonly').objectStore(name).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
}

export async function dumpArtArchive(): Promise<ArtArchive> {
  const db=await openArtDb()
  try{return{items:await readStore(db,'items'),matches:await readStore(db,'matches')}}finally{db.close()}
}

export async function mergeArtArchive(archive?: Partial<ArtArchive>) {
  if(!archive)return
  const db=await openArtDb()
  try{for(const [name,records] of [['items',archive.items],['matches',archive.matches]] as const){if(!db.objectStoreNames.contains(name)||!records?.length)continue;await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(name,'readwrite'),store=transaction.objectStore(name);for(const record of records)store.put(record);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error)})}}finally{db.close()}
}

export async function clearArtArchive() {
  const db=await openArtDb()
  try{for(const name of ['items','matches'])if(db.objectStoreNames.contains(name))await new Promise<void>((resolve,reject)=>{const request=db.transaction(name,'readwrite').objectStore(name).clear();request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error)})}finally{db.close()}
}
