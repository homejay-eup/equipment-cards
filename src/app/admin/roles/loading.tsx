import { ShieldCheck } from 'lucide-react'
import AdminLoadingSkeleton from '@/components/AdminLoadingSkeleton'

export default function Loading() {
  return <AdminLoadingSkeleton icon={ShieldCheck} title="角色管理" maxWidthClassName="max-w-3xl" rows={6} />
}
