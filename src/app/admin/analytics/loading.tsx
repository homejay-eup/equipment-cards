import { BarChart3 } from 'lucide-react'
import AdminLoadingSkeleton from '@/components/AdminLoadingSkeleton'

export default function Loading() {
  return <AdminLoadingSkeleton icon={BarChart3} title="使用統計" rows={6} />
}
