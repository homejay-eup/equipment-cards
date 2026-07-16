import { Users } from 'lucide-react'
import AdminLoadingSkeleton from '@/components/AdminLoadingSkeleton'

export default function Loading() {
  return <AdminLoadingSkeleton icon={Users} title="帳號管理" rows={8} />
}
