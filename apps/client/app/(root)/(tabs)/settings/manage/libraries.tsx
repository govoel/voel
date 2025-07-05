import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { useMutation } from '@tanstack/react-query';
import { schemas } from '@voel/schemas';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { toast } from 'sonner-native';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { instanceStore } from '~/lib/stores/instance';

export default function LibraryListScreen() {
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isFetching } = api.libraries.list.useQuery(instanceDb);

  const createLibraryModalRef = useRef<BottomSheetModalType>(null);

  const createLibraryMutation = useMutation(
    apiInstance.v1.library.create.mutationOptions({
      onSuccess: () => {
        toast.success('Library created successfully');
      },
      onError: (error) => {
        toast.error('Failed to create library', { description: error.message || 'Unknown error' });
      },
    })
  );

  const CreateLibraryForm = useAppForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onChange: schemas.v1.library.create,
    },
    onSubmit: async ({ value, formApi }) => {
      await createLibraryMutation.mutateAsync(schemas.v1.library.create.parse(value));
      createLibraryModalRef.current?.dismiss();
      createLibraryMutation.reset();
      formApi.reset();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Libraries', headerTitleAlign: 'center' }} />
      <FloatingPlayerDodgingLayout>
        <Button
          variant="secondary"
          onPress={() => {
            createLibraryModalRef.current?.present();
          }}>
          <Text>Create New Library</Text>
        </Button>
        <TitleWithRefetch className="pt-4" refetch={refetch} isFetching={isFetching}>
          Libraries
        </TitleWithRefetch>
        {data ? (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <Card className="mt-4">
                <CardHeader className="flex-row justify-between items-center">
                  <Library item={item} />
                </CardHeader>
              </Card>
            )}
            ListEmptyComponent={() => (
              <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
                <Text className="text-center">No libraries found</Text>
              </View>
            )}
          />
        ) : error ? (
          <>
            <CardContent className="pt-4">
              <Large>Error loading libraries</Large>
              <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => refetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </>
        ) : (
          <CardContent className="p-12 justify-center items-center">
            <Spinner size={15} />
          </CardContent>
        )}
      </FloatingPlayerDodgingLayout>

      <BottomSheetModal ref={createLibraryModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Create New Library</Large>
          <CreateLibraryForm.AppForm>
            <CreateLibraryForm.AppField
              name="name"
              children={(field) => (
                <field.TextField
                  label="Name"
                  inputProps={{
                    autoComplete: 'name',
                    autoCorrect: false,
                    placeholder: 'Alexandria',
                  }}
                />
              )}
            />

            <CreateLibraryForm.SubmitButton>
              <Text>Create New Library</Text>
            </CreateLibraryForm.SubmitButton>
          </CreateLibraryForm.AppForm>
        </View>
      </BottomSheetModal>
    </>
  );
}

const Library = ({ item }: { item: { id: number; name: string } }) => {
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);

  const scanLibraryMutation = useMutation(
    apiInstance.v1.library.scan.mutationOptions({
      onSuccess: (data) => {
        toast.success(data.message);
      },
      onError: (error) => {
        toast.error('Failed to start library scan', {
          description: error.message || 'Unknown error',
        });
      },
    })
  );

  const ScanLibraryForm = useAppForm({
    defaultValues: { id: item.id },
    validators: {
      onChange: schemas.v1.library.scan,
    },
    onSubmit: async ({ value, formApi }) => {
      await scanLibraryMutation.mutateAsync(schemas.v1.library.scan.parse(value));
      scanLibraryMutation.reset();
      formApi.reset();
    },
  });

  return (
    <>
      <Large>{item.name}</Large>
      <ScanLibraryForm.AppForm>
        <ScanLibraryForm.SubmitButton size="sm" variant="secondary">
          <Text>Scan</Text>
        </ScanLibraryForm.SubmitButton>
      </ScanLibraryForm.AppForm>
    </>
  );
};
