import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from './db'
import { getSettings, listDoctors, listRooms, listServices, setSetting, type Doctor, type Room, type Service } from './db/data'

/** Clinic settings, price list, doctors and rooms. `version` is bumped after changes so screens reload. */
export const useClinic = defineStore('clinic', () => {
  const settings = ref<Record<string, string>>({})
  const services = ref<Service[]>([])
  const doctors = ref<Doctor[]>([]) // all, active first
  const rooms = ref<Room[]>([])
  const version = ref(0)
  async function load() {
    ;[settings.value, services.value, doctors.value, rooms.value] = await Promise.all([getSettings(db), listServices(db), listDoctors(db, true), listRooms(db, true)])
    version.value++
  }
  const ready = computed(() => !!settings.value.book_id)
  const name = computed(() => settings.value.book_name ?? '')
  const currency = computed(() => (settings.value.currency === 'USD' ? 'USD' : 'KHR') as 'KHR' | 'USD')
  const activeDoctors = computed(() => doctors.value.filter((d) => d.active))
  const activeRooms = computed(() => rooms.value.filter((r) => r.active))
  const doctor = (id: string | null | undefined) => (id ? doctors.value.find((d) => d.id === id) : undefined)
  const room = (id: string | null | undefined) => (id ? rooms.value.find((r) => r.id === id) : undefined)
  async function set(key: string, value: string) {
    await setSetting(db, key, value)
    await load()
  }
  return { settings, services, doctors, rooms, activeDoctors, activeRooms, doctor, room, version, load, ready, name, currency, set, setName: (v: string) => set('book_name', v) }
})
