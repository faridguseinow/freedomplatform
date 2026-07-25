import { Settings } from 'lucide-react'
import { PageScaffold } from '../../../components/common/PageScaffold'

export function PlatformSettingsPage() {
  return (
    <PageScaffold
      description="Будущий центр системных параметров, доступный только владельцу платформы."
      emptyDescription="Параметры безопасности, тарифов и интеграций будут добавлены после базовой модели данных."
      emptyTitle="Настройки платформы пока пустые"
      icon={Settings}
      title="Настройки платформы"
    />
  )
}
