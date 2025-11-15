import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('Health Check API', () => {
  it('should return 200 OK with status healthy', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toEqual({ status: 'healthy' })
  })
})
