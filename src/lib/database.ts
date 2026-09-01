import type { CsvMeasurement, DailyRecord } from '../types'
import { applyImportedMeasurements } from './csv'

const databaseName = 'karada-log'
const storeName = 'daily-records'

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error ?? new Error('データベースの読み書きに失敗しました。'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('データベースの更新に失敗しました。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('データベースの更新を中止しました。'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) open.result.createObjectStore(storeName, { keyPath: 'date' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('データベースを開けませんでした。'))
  })
}

export async function getAllRecords(): Promise<DailyRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  const records = await request(transaction.objectStore(storeName).getAll()) as DailyRecord[]
  await transactionComplete(transaction)
  database.close()
  return records.sort((a, b) => b.date.localeCompare(a.date))
}

export async function importMeasurements(measurements: CsvMeasurement[]): Promise<{ added: number; updated: number }> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const existingRecords = await request(store.getAll()) as DailyRecord[]
  const result = applyImportedMeasurements(new Map(existingRecords.map((record) => [record.date, record])), measurements)
  result.records.forEach((record) => store.put(record))
  await transactionComplete(transaction)
  database.close()
  return { added: result.added, updated: result.updated }
}

export async function saveCalories(date: string, intakeCalories?: number, activeCalories?: number): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const previous = await request(store.get(date)) as DailyRecord | undefined
  store.put({
    ...previous,
    date,
    intakeCalories,
    activeCalories,
    updatedAt: new Date().toISOString()
  } satisfies DailyRecord)
  await transactionComplete(transaction)
  database.close()
}
