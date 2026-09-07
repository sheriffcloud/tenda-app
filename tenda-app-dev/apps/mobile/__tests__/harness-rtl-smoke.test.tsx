/**
 * RTL pipeline smoke (#101). Proves jest-expo transforms RN/JSX and that
 * @testing-library/react-native renders + queries a real RN component. If the
 * transformIgnorePatterns whitelist is wrong, importing react-native fails
 * here, which is the point of validating it in the harness spike.
 */
import { Text, View } from 'react-native'
import { render } from '@testing-library/react-native'

describe('react-native testing pipeline', () => {
  it('renders and queries a native component tree', () => {
    const { getByText } = render(
      <View>
        <Text>hello tenda</Text>
      </View>,
    )
    expect(getByText('hello tenda')).toBeTruthy()
  })
})
