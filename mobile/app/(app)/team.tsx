import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import FormInput from '../../components/ui/FormInput';
import ListRow from '../../components/ui/ListRow';
import PageShell from '../../components/ui/PageShell';
import SelectField from '../../components/ui/SelectField';
import { roleApi, userApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';

export default function TeamScreen() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const plan = useAuthStore((s) => s.plan);
  const canManage = useAuthStore((s) => s.hasPermission('users.create'));

  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');

  const { data: users, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['team-users'],
    queryFn: async () => (await userApi.list()).data,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['team-roles'],
    queryFn: async () => (await roleApi.list()).data,
    enabled: showInvite,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => userApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-users'] });
      setShowInvite(false);
      setName(''); setEmail(''); setPassword(''); setRoleId('');
      Alert.alert('Success', 'Team member added');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to add user';
      Alert.alert('Error', msg);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-users'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to deactivate');
    },
  });

  const list: any[] = Array.isArray(users) ? users : users?.items ?? [];
  const roles: any[] = Array.isArray(rolesData) ? rolesData : rolesData?.items ?? [];
  const activeCount = list.filter((u) => u.isActive !== false).length;

  const onSubmit = () => {
    if (!name.trim()) { Alert.alert('Required', 'Name is required'); return; }
    if (!email.trim()) { Alert.alert('Required', 'Email is required'); return; }
    if (password && password.length < 6) { Alert.alert('Weak password', 'Password must be at least 6 characters'); return; }
    createMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      password: password || undefined,
      roleIds: roleId ? [roleId] : [],
    });
  };

  const onUserPress = (u: any) => {
    if (!canManage) return;
    if (u.id === currentUser?.id) return;
    Alert.alert(
      u.name,
      `${u.email}\nStatus: ${u.isActive === false ? 'Inactive' : 'Active'}`,
      [
        { text: 'Close', style: 'cancel' },
        u.isActive !== false
          ? {
              text: 'Deactivate',
              style: 'destructive' as const,
              onPress: () => deactivateMutation.mutate(u.id),
            }
          : { text: 'Close', style: 'cancel' as const },
      ]
    );
  };

  return (
    <PageShell
      title="Team"
      subtitle="Manage users in your workspace"
      action={
        canManage ? (
          <Button
            size="sm"
            leftIcon={<Plus size={12} color="#fff" />}
            onPress={() => {
              setShowInvite(true);
            }}
          >
            Add
          </Button>
        ) : null
      }
      loading={isLoading}
      error={error}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      {/* Team summary card */}
      {plan ? (
        <Card className="p-5 mb-4">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-2xl bg-emerald-50 items-center justify-center mr-3">
              <Users size={18} color="#04AB94" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900 tracking-tight">
                Team members
              </Text>
              <Text className="text-[13px] text-slate-500 font-medium">
                {plan.name} plan
              </Text>
            </View>
            <Text className="text-[20px] font-extrabold text-slate-900 tracking-tight">
              {activeCount}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {list.length > 0 ? (
          list.map((u, idx) => {
            const roleNames = (u.roles || [])
              .map((ur: any) => ur.role?.name || ur.role?.code)
              .filter(Boolean)
              .join(', ');
            const isMe = u.id === currentUser?.id;
            return (
              <ListRow
                key={u.id}
                isFirst={idx === 0}
                icon={<UserCog size={15} color="#04AB94" />}
                title={`${u.name}${isMe ? ' (You)' : ''}`}
                subtitle={u.email}
                meta={roleNames || u.role}
                onPress={() => onUserPress(u)}
                right={
                  <View className="items-end gap-1">
                    <Badge variant={u.isActive === false ? 'slate' : 'emerald'} dot>
                      {u.isActive === false ? 'Inactive' : 'Active'}
                    </Badge>
                  </View>
                }
              />
            );
          })
        ) : (
          <EmptyState
            icon={<Users size={24} color="#94a3b8" />}
            title="No team members yet"
            description="Add users to give them access to this workspace."
          />
        )}
      </Card>

      <BottomSheet visible={showInvite} onClose={() => setShowInvite(false)} title="Add Team Member">
        <FormInput label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" />
        <FormInput label="Email" value={email} onChangeText={setEmail} placeholder="jane@company.com" keyboardType="email-address" autoCapitalize="none" />
        <FormInput label="Temporary Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Min. 6 characters" />
        <SelectField
          label="Role"
          value={roleId}
          onChange={setRoleId}
          placeholder="Select role (optional)"
          options={roles.map((r) => ({ label: r.name, value: r.id }))}
        />

        <View className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4">
          <Text className="text-[12px] font-bold text-emerald-700">
            The user can sign in with their email and the password you set.
          </Text>
        </View>

        <Button onPress={onSubmit} loading={createMutation.isPending} className="mt-2">
          Add Member
        </Button>
      </BottomSheet>
    </PageShell>
  );
}
