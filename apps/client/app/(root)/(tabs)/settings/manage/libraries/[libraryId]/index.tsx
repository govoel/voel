import { useMutation } from '@tanstack/react-query';
import { schemas } from '@voel/schemas';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { BookAlert } from '~/components/icons/BookAlert';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { FileWarning } from '~/components/icons/FileWarning';
import { Button } from '~/components/ui/button';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';

import { useApiInstance } from '~/lib/stores/instance';

export default function LibraryPage() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const idNum = parseInt(libraryId);

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <FloatingPlayerDodgingScrollView>
        <ScanLibraryButton id={idNum} />

        <View className="mt-4 overflow-hidden rounded-md border border-foreground/15">
          <Link
            href={{
              pathname: '/settings/manage/libraries/[libraryId]/unidentified/files',
              params: { libraryId },
            }}
            asChild
            push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <FileWarning className="text-muted-foreground" size="20" />
                <Text>Unidentified Files</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
          <Button variant="ghost" className="flex-row justify-between rounded-none bg-secondary/40">
            <View className="flex flex-row items-center justify-center gap-x-2">
              <BookAlert className="text-muted-foreground" size="20" />
              <Text>Unidentified Books</Text>
            </View>
            <ChevronRight className="text-muted-foreground" size="20" />
          </Button>
        </View>
      </FloatingPlayerDodgingScrollView>
    </>
  );
}

const ScanLibraryButton = ({ id }: { id: number }) => {
  const apiInstance = useApiInstance();

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
    defaultValues: { id },
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
    <ScanLibraryForm.AppForm>
      <ScanLibraryForm.SubmitButton variant="secondary">
        <Text>Scan Library</Text>
      </ScanLibraryForm.SubmitButton>
    </ScanLibraryForm.AppForm>
  );
};
