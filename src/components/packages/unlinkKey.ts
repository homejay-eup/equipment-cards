// 共用的取消掛載選取 key，供 PackageExplorer / PackageListView / EquipmentListView 共用。
export function unlinkKey(packageId: string, equipmentId: string) {
  return `${packageId}::${equipmentId}`
}
