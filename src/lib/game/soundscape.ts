import type { QuestState } from './types'

export interface SoundscapeProfile {
  wind: number
  rail: number
  birds: number
  roomTone: number
}

export function soundscapeProfile(quest: QuestState, inStation = false): SoundscapeProfile {
  return {
    wind: inStation ? 0.008 : 0.024,
    rail: quest.stationNameRestored ? (inStation ? 0.022 : 0.012) : 0,
    birds: quest.chorus === 'complete' && !inStation ? 0.045 : 0,
    roomTone: inStation ? 0.018 : 0,
  }
}

export class Soundscape {
  private context: AudioContext | undefined
  private master: GainNode | undefined
  private wind: GainNode | undefined
  private rail: GainNode | undefined
  private roomTone: GainNode | undefined
  private profile: SoundscapeProfile = { wind: 0, rail: 0, birds: 0, roomTone: 0 }
  private enabled: boolean
  private nextBirdAt = 0
  private sources: AudioScheduledSourceNode[] = []

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  start(profile: SoundscapeProfile): void {
    this.profile = profile
    if (!this.enabled) return
    this.ensureGraph()
    void this.context?.resume()
    this.applyProfile()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      if (this.master && this.context) this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.05)
      return
    }
    this.ensureGraph()
    void this.context?.resume()
    this.applyProfile()
  }

  setProfile(profile: SoundscapeProfile): void {
    this.profile = profile
    if (this.context && this.enabled) this.applyProfile()
  }

  update(elapsed: number): void {
    if (!this.enabled || !this.context || this.profile.birds === 0 || elapsed < this.nextBirdAt) return
    this.nextBirdAt = elapsed + 2.6 + Math.random() * 3.4
    this.playCue(760 + Math.random() * 330, 0.09, this.profile.birds)
  }

  playCue(frequency: number, duration = 0.22, volume = 0.075): void {
    if (!this.enabled) return
    this.ensureGraph()
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.82), this.context.currentTime + duration)
    gain.gain.setValueAtTime(0.0001, this.context.currentTime)
    gain.gain.exponentialRampToValueAtTime(volume, this.context.currentTime + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration)
    oscillator.connect(gain).connect(this.master)
    oscillator.start()
    oscillator.stop(this.context.currentTime + duration + 0.02)
    this.sources.push(oscillator)
  }

  dispose(): void {
    for (const source of this.sources) source.stop()
    this.sources = []
    void this.context?.close()
  }

  private ensureGraph(): void {
    if (this.context) return
    this.context = new AudioContext()
    this.master = this.context.createGain()
    this.master.gain.value = 0.16
    this.master.connect(this.context.destination)

    this.wind = this.context.createGain()
    this.wind.connect(this.master)
    const windFilter = this.context.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 430
    windFilter.Q.value = 0.35
    const windSource = this.context.createBufferSource()
    windSource.buffer = this.createNoiseBuffer(2.4)
    windSource.loop = true
    windSource.connect(windFilter).connect(this.wind)
    windSource.start()
    this.sources.push(windSource)

    this.rail = this.context.createGain()
    this.rail.connect(this.master)
    const railOscillator = this.context.createOscillator()
    railOscillator.type = 'sine'
    railOscillator.frequency.value = 55
    railOscillator.connect(this.rail)
    railOscillator.start()
    this.sources.push(railOscillator)

    this.roomTone = this.context.createGain()
    this.roomTone.connect(this.master)
    const roomOscillator = this.context.createOscillator()
    roomOscillator.type = 'sine'
    roomOscillator.frequency.value = 174.6
    roomOscillator.connect(this.roomTone)
    roomOscillator.start()
    this.sources.push(roomOscillator)
  }

  private applyProfile(): void {
    if (!this.context || !this.master || !this.wind || !this.rail || !this.roomTone) return
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(this.enabled ? 0.16 : 0.0001, now, 0.06)
    this.wind.gain.setTargetAtTime(this.profile.wind, now, 0.18)
    this.rail.gain.setTargetAtTime(this.profile.rail, now, 0.18)
    this.roomTone.gain.setTargetAtTime(this.profile.roomTone, now, 0.18)
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const buffer = this.context!.createBuffer(1, Math.floor(this.context!.sampleRate * seconds), this.context!.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1
    return buffer
  }
}
