import { Building2 } from 'lucide-react'
import AdminLoadingSkeleton from '@/components/AdminLoadingSkeleton'

export default function Loading() {
  return <AdminLoadingSkeleton icon={Building2} title="部門管理" maxWidthClassName="max-w-3xl" rows={5} />
}
