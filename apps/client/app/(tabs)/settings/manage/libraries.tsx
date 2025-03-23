import { schemas } from '@apricotta/schemas';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { toast } from 'sonner-native';
import { z } from 'zod';

import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { instanceStore } from '~/lib/stores/instance';

export default function LibraryListScreen() {
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);
  const { data, error, refetch, isLoading } = useQuery(
    apiInstance.v1.library.fetchAll.queryOptions()
  );

  const createLibraryModalRef = useRef<BottomSheetModal>(null);

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
      <ScrollView className="px-6">
        <View className="py-6">
          <Button
            variant="secondary"
            onPress={() => {
              createLibraryModalRef.current?.present();
            }}>
            <Text>Create New Library</Text>
          </Button>
          <TitleWithRefetch className="pt-4" refetch={refetch} isLoading={isLoading}>
            Libraries
          </TitleWithRefetch>
          {error ? (
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
          ) : data ? (
            <FlashList
              data={data}
              renderItem={({ item, index }) => (
                <Card className="mt-4">
                  <CardHeader className="flex-row justify-between items-center">
                    <Library item={item} />
                  </CardHeader>
                </Card>
              )}
              keyExtractor={(item) => item.id.toString()}
              estimatedItemSize={20}
              ListEmptyComponent={() => (
                <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
                  <Text className="text-center">No libraries found</Text>
                </View>
              )}
            />
          ) : (
            <CardContent className="p-12 justify-center items-center">
              <Spinner size={15} />
            </CardContent>
          )}
        </View>
      </ScrollView>

      <BottomSheet ref={createLibraryModalRef}>
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
      </BottomSheet>
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
