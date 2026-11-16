import { ref } from 'vue'

import { backend, BackendError, type Note } from '@/services/backend'

export type NotesStatus = 'loading' | 'ready' | 'empty' | 'error'

function messageFor(error: unknown): string {
  return error instanceof BackendError ? error.message : 'Something went wrong with your notes.'
}

/** Loads the signed-in user's notes and lets them add and delete. */
export function useNotes() {
  const status = ref<NotesStatus>('loading')
  const notes = ref<Note[]>([])
  const errorMessage = ref('')
  const saving = ref(false)
  const saveError = ref('')

  function settle() {
    status.value = notes.value.length > 0 ? 'ready' : 'empty'
  }

  async function load() {
    status.value = 'loading'
    try {
      notes.value = await backend.listNotes()
      settle()
    } catch (error) {
      errorMessage.value = messageFor(error)
      status.value = 'error'
    }
  }

  async function change(action: () => Promise<void>): Promise<boolean> {
    saving.value = true
    saveError.value = ''
    try {
      await action()
      settle()
      return true
    } catch (error) {
      saveError.value = messageFor(error)
      return false
    } finally {
      saving.value = false
    }
  }

  function add(body: string): Promise<boolean> {
    return change(async () => {
      const note = await backend.addNote(body.trim())
      notes.value = [note, ...notes.value]
    })
  }

  function remove(id: string): Promise<boolean> {
    return change(async () => {
      await backend.deleteNote(id)
      notes.value = notes.value.filter((note) => note.id !== id)
    })
  }

  void load()

  return { status, notes, errorMessage, saving, saveError, load, add, remove }
}
